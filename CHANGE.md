This repo is forked from tompascall/js-to-styles-var-loader and change some contents to meet my need.

The changes are as follows:

- change the `require` sentence.

previous:

```js
require('vars.js');
```

current:

```less
@import 'vars.js';
```

- support resolve `node_modules` and webpack `resolve.alias` directories. Just prepend them with a `~`.

```less
@import '~themes/vars.js';
```

- optimize `getPreprocessorType` . Use webpack `resourcePath` to analyze resource type, ignore resource query part.

previous, it not support:

```js
import 'style.less?local';
```

but now, it can support above.