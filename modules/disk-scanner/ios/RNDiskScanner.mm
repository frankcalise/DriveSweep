#import "RNDiskScanner.h"
#import "RNDiskScannerCore.h"

#import <React/RCTBridgeModule.h>

@implementation RNDiskScanner {
  BOOL _hasListeners;
  volatile BOOL _cancelled;
}

RCT_EXPORT_MODULE(NativeDiskScanner)

- (NSArray<NSString *> *)supportedEvents
{
  return @[@"onRootComplete"];
}

- (void)startObserving
{
  _hasListeners = YES;
}

- (void)stopObserving
{
  _hasListeners = NO;
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeDiskScannerSpecJSI>(params);
}

- (NSNumber *)hasFullDiskAccess
{
  return @(RNDiskScannerHasFullDiskAccess());
}

- (void)cancel
{
  _cancelled = YES;
}

- (void)scanRoots:(NSString *)pathsJson
      optionsJson:(NSString *)optionsJson
          resolve:(RCTPromiseResolveBlock)resolve
           reject:(RCTPromiseRejectBlock)reject
{
  id rawPaths = RNDiskScannerJSONObjectFromString(pathsJson);
  NSArray *paths = [rawPaths isKindOfClass:NSArray.class] ? rawPaths : @[];

  id rawOptions = RNDiskScannerJSONObjectFromString(optionsJson);
  NSDictionary *options = [rawOptions isKindOfClass:NSDictionary.class] ? rawOptions : @{};
  const BOOL crossDevices = [options[@"crossDevices"] boolValue];

  _cancelled = NO;

  // Off the main thread: a full catalog walk touches millions of inodes.
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    NSDictionary *result = RNDiskScannerRun(
        paths, crossDevices, &self->_cancelled,
        ^(NSDictionary *root, NSUInteger index, NSUInteger total) {
          if (!self->_hasListeners) {
            return;
          }
          // One event per ROOT, never per file — the bridge cost is per call
          // and the UI only needs entry-level granularity.
          dispatch_async(dispatch_get_main_queue(), ^{
            NSMutableDictionary *body = [root mutableCopy];
            body[@"index"] = @(index);
            body[@"total"] = @(total);
            [self sendEventWithName:@"onRootComplete" body:body];
          });
        });

    dispatch_async(dispatch_get_main_queue(), ^{
      resolve(RNDiskScannerJSONString(result));
    });
  });
}

@end
