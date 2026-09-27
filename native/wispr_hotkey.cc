#include <ApplicationServices/ApplicationServices.h>
#include <node_api.h>
#include <unistd.h>

namespace {

constexpr CGKeyCode kFunctionKeyCode = 63;

napi_value BooleanValue(napi_env env, bool value) {
  napi_value result;
  napi_get_boolean(env, value, &result);
  return result;
}

bool PostFunctionKey(CGEventSourceRef source, bool down) {
  CGEventRef event = CGEventCreateKeyboardEvent(source, kFunctionKeyCode, down);
  if (event == nullptr) return false;
  CGEventSetType(event, kCGEventFlagsChanged);
  CGEventSetFlags(event, down ? kCGEventFlagMaskSecondaryFn : 0);
  CGEventPost(kCGHIDEventTap, event);
  CFRelease(event);
  return true;
}

napi_value IsTrusted(napi_env env, napi_callback_info) {
  return BooleanValue(env, AXIsProcessTrusted());
}

napi_value PromptForTrust(napi_env env, napi_callback_info) {
  const void* keys[] = {kAXTrustedCheckOptionPrompt};
  const void* values[] = {kCFBooleanTrue};
  CFDictionaryRef options = CFDictionaryCreate(
      kCFAllocatorDefault,
      keys,
      values,
      1,
      &kCFTypeDictionaryKeyCallBacks,
      &kCFTypeDictionaryValueCallBacks);
  const bool trusted = AXIsProcessTrustedWithOptions(options);
  CFRelease(options);
  return BooleanValue(env, trusted);
}

napi_value TapFn(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);

  uint32_t taps = 0;
  if (argc != 1 || napi_get_value_uint32(env, args[0], &taps) != napi_ok ||
      (taps != 1 && taps != 2)) {
    napi_throw_range_error(env, nullptr, "Fn taps must be 1 or 2.");
    return nullptr;
  }
  if (!AXIsProcessTrusted()) {
    napi_throw_error(env, "ACCESSIBILITY_REQUIRED", "Node does not have macOS Accessibility permission.");
    return nullptr;
  }

  CGEventSourceRef source = CGEventSourceCreate(kCGEventSourceStateHIDSystemState);
  if (source == nullptr) {
    napi_throw_error(env, "HOTKEY_FAILED", "Could not create a macOS keyboard event source.");
    return nullptr;
  }

  bool posted = true;
  for (uint32_t index = 0; index < taps; ++index) {
    posted = PostFunctionKey(source, true) && posted;
    usleep(55'000);
    posted = PostFunctionKey(source, false) && posted;
    if (index + 1 < taps) usleep(105'000);
  }
  CFRelease(source);

  if (!posted) {
    napi_throw_error(env, "HOTKEY_FAILED", "macOS rejected the Fn keyboard event.");
    return nullptr;
  }
  return BooleanValue(env, true);
}

napi_value Initialize(napi_env env, napi_value exports) {
  napi_property_descriptor properties[] = {
      {"isTrusted", nullptr, IsTrusted, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"promptForTrust", nullptr, PromptForTrust, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"tapFn", nullptr, TapFn, nullptr, nullptr, nullptr, napi_default, nullptr},
  };
  napi_define_properties(env, exports, 3, properties);
  return exports;
}

}  // namespace

NAPI_MODULE(NODE_GYP_MODULE_NAME, Initialize)
