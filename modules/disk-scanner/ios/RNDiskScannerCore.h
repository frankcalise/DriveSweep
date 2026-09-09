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

/// TCC probe. Reading TCC.db requires Full Disk Access, so this is a reliable
/// proxy for "can we see ~/Library at all".
BOOL RNDiskScannerHasFullDiskAccess(void);

id _Nullable RNDiskScannerJSONObjectFromString(NSString *_Nullable json);
NSString *RNDiskScannerJSONString(id value);

NS_ASSUME_NONNULL_END
