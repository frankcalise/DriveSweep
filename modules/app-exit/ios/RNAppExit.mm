#import "RNAppExit.h"

#import <React/RCTBridgeModule.h>
#import <TargetConditionals.h>

#if TARGET_OS_OSX
#import <AppKit/AppKit.h>
#endif

@interface RNAppExit ()
#if TARGET_OS_OSX
@property (nonatomic, assign) BOOL hasAppExitListeners;
@property (nonatomic, assign) BOOL isWaitingForExitCompletion;
@property (nonatomic, assign) BOOL quitOnLastWindowClosed;
#endif
@end

@implementation RNAppExit

#if TARGET_OS_OSX
static __weak RNAppExit *RNAppExitSharedInstance = nil;
#endif

RCT_EXPORT_MODULE(NativeAppExit)

- (instancetype)init
{
  if (self = [super init]) {
#if TARGET_OS_OSX
    RNAppExitSharedInstance = self;
    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(handleWillTerminate:)
                                                 name:NSApplicationWillTerminateNotification
                                               object:nil];
    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(handleWindowWillClose:)
                                                 name:NSWindowWillCloseNotification
                                               object:nil];
#endif
  }
  return self;
}

- (void)dealloc
{
#if TARGET_OS_OSX
  if (RNAppExitSharedInstance == self) {
    RNAppExitSharedInstance = nil;
  }
  [[NSNotificationCenter defaultCenter] removeObserver:self];
#endif
}

- (void)startObserving
{
#if TARGET_OS_OSX
  self.hasAppExitListeners = YES;
#endif
}

- (void)stopObserving
{
#if TARGET_OS_OSX
  self.hasAppExitListeners = NO;
#endif
}

- (NSArray<NSString *> *)supportedEvents
{
  return @[@"AppExitRequested"];
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeAppExitSpecJSI>(params);
}

- (NSNumber *)isSupported
{
#if TARGET_OS_OSX
  return @YES;
#else
  return @NO;
#endif
}

- (void)setQuitOnLastWindowClosed:(BOOL)enabled
{
#if TARGET_OS_OSX
  self.quitOnLastWindowClosed = enabled;
#endif
}

- (void)requestExit
{
#if TARGET_OS_OSX
  dispatch_async(dispatch_get_main_queue(), ^{
    [NSApp terminate:nil];
  });
#endif
}

- (void)completeExit:(BOOL)allow
{
#if TARGET_OS_OSX
  dispatch_async(dispatch_get_main_queue(), ^{
    self.isWaitingForExitCompletion = NO;
    [NSApp replyToApplicationShouldTerminate:allow ? NSTerminateNow : NSTerminateCancel];
  });
#endif
}

#if TARGET_OS_OSX
+ (NSApplicationTerminateReply)applicationShouldTerminate
{
  RNAppExit *module = RNAppExitSharedInstance;
  if (!module || !module.hasAppExitListeners) {
    return NSTerminateNow;
  }
  if (module.isWaitingForExitCompletion) {
    return NSTerminateLater;
  }

  module.isWaitingForExitCompletion = YES;
  [module sendEventWithName:@"AppExitRequested" body:@{@"reason": @"requested"}];
  return NSTerminateLater;
}

- (void)handleWillTerminate:(__unused NSNotification *)notification
{
  [self sendEventWithName:@"AppExitRequested" body:@{@"reason": @"willTerminate"}];
}

- (void)handleWindowWillClose:(NSNotification *)notification
{
  if (!self.quitOnLastWindowClosed) {
    return;
  }
  NSWindow *closing = [notification.object isKindOfClass:NSWindow.class]
                          ? (NSWindow *)notification.object
                          : nil;
  if (closing == nil) {
    return;
  }
  // The closing window is still in NSApp.windows at notification time, so it
  // has to be excluded. Panels and the like are ignored — only real visible
  // windows keep the app alive.
  dispatch_async(dispatch_get_main_queue(), ^{
    for (NSWindow *window in NSApp.windows) {
      if (window != closing && window.isVisible && !window.isSheet &&
          [window isKindOfClass:NSWindow.class] && window.canBecomeMainWindow) {
        return;
      }
    }
    [NSApp terminate:nil];
  });
}
#endif

@end
