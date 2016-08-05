## v0.2.1 / 2016-08-06
- Fix exception when all frames are blackboxed
- Fix handling for multiline error message

## v0.2.0 / 2015-10-29

- Blackbox path now recognizes all global module paths
- Fix asyncOrigin missing if the last frame is blackboxed
- Fix built-in module cannot be blackboxed

## v0.1.3 / 2015-10-26

- Fix error calling `CallSite.getTypeName()`
- Fix `formatter.formatSource()` for native frame (`"native"` instead of `"null:null"`)
