## v0.2.4 / 2016-08-11

- If topmost frames are blackboxed, the last blackboxed frame above the
  visible frames are always shown (unblackboxed) to avoid confusion about actual raised location
- Fix handling for multiline error message
- Fix `prepAsyncStack()` does not work as expected in `process.nextTick` callback.

## v0.2.2 / 2016-08-06

- Fix exception when all frames are blackboxed

## v0.2.0 / 2015-10-29

- Blackbox path now recognizes all global module paths
- Fix asyncOrigin missing if the last frame is blackboxed
- Fix built-in module cannot be blackboxed

## v0.1.3 / 2015-10-26

- Fix error calling `CallSite.getTypeName()`
- Fix `formatter.formatSource()` for native frame (`"native"` instead of `"null:null"`)
