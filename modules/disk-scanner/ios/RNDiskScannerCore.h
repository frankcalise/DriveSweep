#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// Per-root result: @{ path, present, bytes, files, dirs, dedupedInodes,
///                     unreadable, elapsedMs, cancelled }
typedef void (^RNDiskScannerRootBlock)(NSDictionary *root,
                                       NSUInteger index,
                                       NSUInteger total);

/// Walks `paths` and reports disk usage per root.
///
/// Sizing uses `st_blocks * 512` (actual blocks allocated), never `st_size`.
/// On this machine `Docker.raw` reports 60 GB apparent vs 8.1 GB actual — a
/// 7.4x error — because it is sparse.
///
/// Hardlinked inodes are counted once per scan. The pnpm store is hardlinked
/// into every node_modules, so naive summing badly over-reports.
NSDictionary *RNDiskScannerRun(NSArray<NSString *> *paths,
                               BOOL crossDevices,
                               volatile BOOL *cancelFlag,
                               RNDiskScannerRootBlock _Nullable onRoot);

/// Aggregates every directory under `root` whose basename is `matchDirName`.
///
/// Covers catalog entries written as globs (`~/code/**​/node_modules`), which a
/// plain walk cannot express. Matches are pruned — a match's contents are
/// counted but not descended into — and `excludeDirNames` are never entered at
/// all, which is what keeps `android/**​/build` from double-counting the build
/// directories that live inside node_modules.
///
/// Returns @{ path, present, bytes, files, dirs, matches, dedupedInodes,
///            unreadable, cancelled, elapsedMs }
NSDictionary *RNDiskScannerMatchDirs(NSString *root,
                                     NSString *matchDirName,
                                     NSString *_Nullable requirePathContains,
                                     NSArray<NSString *> *excludeDirNames,
                                     volatile BOOL *cancelFlag);

/// Whether each path exists and can actually be enumerated.
///
/// Returns @[ @{ path, exists, readable, entries } ].
///
/// This replaces a global "do we have Full Disk Access" guess, which cannot be
/// answered reliably: reading TCC.db is SIP-protected beyond FDA on current
/// macOS, so the usual probe returns false even when access is granted. What
/// actually matters is whether the specific directories in the catalog can be
/// opened, and TCC denial shows up as an empty or refused `opendir`.
NSArray<NSDictionary *> *RNDiskScannerCheckPaths(NSArray<NSString *> *paths);

id _Nullable RNDiskScannerJSONObjectFromString(NSString *_Nullable json);
NSString *RNDiskScannerJSONString(id value);

NS_ASSUME_NONNULL_END
