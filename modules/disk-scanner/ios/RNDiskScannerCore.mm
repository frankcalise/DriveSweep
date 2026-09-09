#import "RNDiskScannerCore.h"

#import <fts.h>
#import <sys/stat.h>
#import <unistd.h>

#import <string>
#import <unordered_set>

namespace {

/// Identity of a file on disk. Hardlinks share one.
struct InodeKey {
  dev_t dev;
  ino_t ino;
  bool operator==(const InodeKey &other) const {
    return dev == other.dev && ino == other.ino;
  }
};

struct InodeHash {
  size_t operator()(const InodeKey &key) const {
    return std::hash<uint64_t>()(static_cast<uint64_t>(key.ino)) ^
           (std::hash<uint64_t>()(static_cast<uint64_t>(key.dev)) << 1);
  }
};

double NowMillis() {
  return [NSDate timeIntervalSinceReferenceDate] * 1000.0;
}

}  // namespace

NSDictionary *RNDiskScannerRun(NSArray<NSString *> *paths,
                               BOOL crossDevices,
                               volatile BOOL *cancelFlag,
                               RNDiskScannerRootBlock onRoot) {
  NSMutableArray<NSDictionary *> *roots = [NSMutableArray array];
  const double startedAt = NowMillis();
  BOOL cancelled = NO;

  const NSUInteger total = paths.count;
  for (NSUInteger index = 0; index < total; index++) {
    id rawPath = paths[index];
    if (![rawPath isKindOfClass:NSString.class]) {
      continue;
    }
    NSString *path = [(NSString *)rawPath stringByExpandingTildeInPath];
    const double rootStartedAt = NowMillis();

    unsigned long long bytes = 0;
    unsigned long long files = 0;
    unsigned long long dirs = 0;
    unsigned long long dedupedInodes = 0;
    unsigned long long unreadable = 0;
    BOOL present = YES;
    BOOL rootCancelled = NO;

    struct stat rootStat;
    if (lstat(path.fileSystemRepresentation, &rootStat) != 0) {
      present = NO;
    } else {
      // Only inodes with more than one link can be reached twice, so only those
      // need remembering. Keeps the set small on trees of millions of files.
      std::unordered_set<InodeKey, InodeHash> seen;

      char *const argv[] = {(char *)path.fileSystemRepresentation, NULL};
      // FTS_PHYSICAL: never follow symlinks — .bin directories are symlink
      // farms and following them double-counts and can loop.
      // FTS_XDEV: stay on one filesystem unless asked otherwise, so mounted
      // volumes are not folded into the parent's total.
      int options = FTS_PHYSICAL | FTS_NOCHDIR;
      if (!crossDevices) {
        options |= FTS_XDEV;
      }

      FTS *tree = fts_open(argv, options, NULL);
      if (tree == NULL) {
        present = NO;
      } else {
        FTSENT *entry = NULL;
        while ((entry = fts_read(tree)) != NULL) {
          if (cancelFlag != NULL && *cancelFlag) {
            rootCancelled = YES;
            cancelled = YES;
            break;
          }

          switch (entry->fts_info) {
            case FTS_DP:
              // Post-order visit of a directory already counted pre-order.
              continue;
            case FTS_DNR:  // unreadable directory
            case FTS_ERR:  // read error
            case FTS_NS:   // stat failed — typically TCC denial
              unreadable++;
              continue;
            default:
              break;
          }

          const struct stat *st = entry->fts_statp;
          if (st == NULL) {
            unreadable++;
            continue;
          }

          if (st->st_nlink > 1) {
            InodeKey key{st->st_dev, st->st_ino};
            if (!seen.insert(key).second) {
              dedupedInodes++;
              continue;  // already counted through another link
            }
          }

          // Actual allocated blocks, not apparent size.
          bytes += static_cast<unsigned long long>(st->st_blocks) * 512ULL;
          if (entry->fts_info == FTS_D) {
            dirs++;
          } else {
            files++;
          }
        }
        fts_close(tree);
      }
    }

    NSDictionary *root = @{
      @"path" : path,
      @"present" : @(present),
      @"bytes" : @(bytes),
      @"files" : @(files),
      @"dirs" : @(dirs),
      @"dedupedInodes" : @(dedupedInodes),
      @"unreadable" : @(unreadable),
      @"cancelled" : @(rootCancelled),
      @"elapsedMs" : @(NowMillis() - rootStartedAt),
    };
    [roots addObject:root];
    if (onRoot != nil) {
      onRoot(root, index, total);
    }
    if (rootCancelled) {
      break;
    }
  }

  return @{
    @"roots" : roots,
    @"cancelled" : @(cancelled),
    @"elapsedMs" : @(NowMillis() - startedAt),
    @"hasFullDiskAccess" : @(RNDiskScannerHasFullDiskAccess()),
  };
}

BOOL RNDiskScannerHasFullDiskAccess(void) {
  NSString *home = NSHomeDirectory();
  NSString *probe =
      [home stringByAppendingPathComponent:
                @"Library/Application Support/com.apple.TCC/TCC.db"];
  return access(probe.fileSystemRepresentation, R_OK) == 0;
}

id RNDiskScannerJSONObjectFromString(NSString *json) {
  if (json.length == 0) {
    return nil;
  }
  NSData *data = [json dataUsingEncoding:NSUTF8StringEncoding];
  if (data == nil) {
    return nil;
  }
  return [NSJSONSerialization JSONObjectWithData:data options:0 error:NULL];
}

NSString *RNDiskScannerJSONString(id value) {
  if (value == nil) {
    return @"null";
  }
  NSData *data = [NSJSONSerialization dataWithJSONObject:value options:0 error:NULL];
  return data != nil ? [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding]
                     : @"null";
}
