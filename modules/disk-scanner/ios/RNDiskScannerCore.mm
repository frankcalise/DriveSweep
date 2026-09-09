#import "RNDiskScannerCore.h"

#import <dirent.h>
#import <fts.h>
#import <sys/stat.h>
#import <unistd.h>

#import <algorithm>
#import <string>
#import <unordered_set>
#import <vector>

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
  };
}

NSArray<NSDictionary *> *RNDiskScannerCheckPaths(NSArray<NSString *> *paths) {
  NSMutableArray<NSDictionary *> *out = [NSMutableArray array];
  for (id raw in paths) {
    if (![raw isKindOfClass:NSString.class]) {
      continue;
    }
    NSString *path = [(NSString *)raw stringByExpandingTildeInPath];
    const char *cPath = path.fileSystemRepresentation;

    struct stat st;
    const BOOL exists = lstat(cPath, &st) == 0;
    BOOL readable = NO;
    unsigned long long entries = 0;

    if (exists) {
      DIR *dir = opendir(cPath);
      if (dir != NULL) {
        readable = YES;
        struct dirent *ent = NULL;
        // Count a few entries only. A TCC-denied directory opens but reads
        // back empty, so "opened" alone is not evidence of access.
        while (entries < 8 && (ent = readdir(dir)) != NULL) {
          if (strcmp(ent->d_name, ".") == 0 || strcmp(ent->d_name, "..") == 0) {
            continue;
          }
          entries++;
        }
        closedir(dir);
      }
    }

    [out addObject:@{
      @"path" : path,
      @"exists" : @(exists),
      @"readable" : @(readable),
      @"entries" : @(entries),
    }];
  }
  return out;
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

NSDictionary *RNDiskScannerMatchDirs(NSString *root,
                                     NSString *matchDirName,
                                     NSString *requirePathContains,
                                     NSArray<NSString *> *excludeDirNames,
                                     volatile BOOL *cancelFlag) {
  NSString *path = [root stringByExpandingTildeInPath];
  const double startedAt = NowMillis();

  unsigned long long bytes = 0;
  unsigned long long files = 0;
  unsigned long long dirs = 0;
  unsigned long long matches = 0;
  unsigned long long dedupedInodes = 0;
  unsigned long long unreadable = 0;
  BOOL cancelled = NO;
  BOOL present = YES;

  NSDictionary *(^absent)(void) = ^NSDictionary *{
    return @{
      @"path" : path, @"present" : @NO, @"bytes" : @0, @"files" : @0,
      @"dirs" : @0, @"matches" : @0, @"dedupedInodes" : @0,
      @"unreadable" : @0, @"cancelled" : @NO, @"elapsedMs" : @0
    };
  };

  struct stat rootStat;
  if (lstat(path.fileSystemRepresentation, &rootStat) != 0) {
    return absent();
  }

  std::unordered_set<InodeKey, InodeHash> seen;
  const std::string needle = matchDirName.UTF8String ?: "";
  const std::string mustContain =
      requirePathContains != nil ? std::string(requirePathContains.UTF8String) : std::string();
  std::vector<std::string> excludes;
  for (NSString *name in excludeDirNames) {
    if ([name isKindOfClass:NSString.class]) {
      excludes.push_back(std::string(name.UTF8String));
    }
  }

  char *const argv[] = {(char *)path.fileSystemRepresentation, NULL};
  FTS *tree = fts_open(argv, FTS_PHYSICAL | FTS_NOCHDIR | FTS_XDEV, NULL);
  if (tree == NULL) {
    return absent();
  }

  // Single pass. On entering a matching directory we record its depth and
  // accumulate everything below it, leaving the region at the post-order visit
  // of the same depth. A nested fts_open() inside an active walk was the
  // obvious alternative and it wedged the process, so: one walk, one cursor.
  int matchLevel = -1;

  FTSENT *entry = NULL;
  while ((entry = fts_read(tree)) != NULL) {
    if (cancelFlag != NULL && *cancelFlag) {
      cancelled = YES;
      break;
    }

    const int level = entry->fts_level;

    if (entry->fts_info == FTS_DP) {
      // Leaving a directory: if it is the one that opened the match, close it.
      if (matchLevel >= 0 && level == matchLevel) {
        matchLevel = -1;
      }
      continue;
    }

    if (entry->fts_info == FTS_DNR || entry->fts_info == FTS_ERR ||
        entry->fts_info == FTS_NS) {
      unreadable++;
      continue;
    }

    const std::string name(entry->fts_name ?: "");

    // Excluded directories are never entered, inside a match or out.
    if (entry->fts_info == FTS_D &&
        std::find(excludes.begin(), excludes.end(), name) != excludes.end()) {
      fts_set(tree, entry, FTS_SKIP);
      continue;
    }

    if (matchLevel < 0) {
      // Outside a match: only look for one starting here.
      if (entry->fts_info != FTS_D || name != needle) {
        continue;
      }
      const std::string full(entry->fts_path ?: "");
      if (!mustContain.empty() && full.find(mustContain) == std::string::npos) {
        continue;
      }
      matches++;
      matchLevel = level;
      // fall through so the matched directory itself is counted
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
        continue;
      }
    }
    bytes += static_cast<unsigned long long>(st->st_blocks) * 512ULL;
    if (entry->fts_info == FTS_D) {
      dirs++;
    } else {
      files++;
    }
  }
  fts_close(tree);

  return @{
    @"path" : path,
    @"present" : @(present),
    @"bytes" : @(bytes),
    @"files" : @(files),
    @"dirs" : @(dirs),
    @"matches" : @(matches),
    @"dedupedInodes" : @(dedupedInodes),
    @"unreadable" : @(unreadable),
    @"cancelled" : @(cancelled),
    @"elapsedMs" : @(NowMillis() - startedAt),
  };
}
