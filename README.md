# xxdom.js
Criss-cross incremental DOM renderer


# Jump start

You can play with the code online [on jsfiddle.net](https://jsfiddle.net/jensh/8k93yzat/).

Load `xx.min.js` and you are ready for rendering dynamic content with well known `{{expression}}` syntax.
The expression in-between `{{}}` is pure JavaScript.

```html
<script src="https://4k2.de/xxdomjs/dist/xx.min.js"></script>

Hello {{ world + '!' }} <br>
Today is: {{ (new Date).toDateString() }}.

<script>
	var world="world";
</script>
```

You can "xx-scope" an HTML element. Additionally to the global JavaScript scope, every expression
placed in one of the children have also access to this xx-scope. This works very much like
local variables in js functions.

```html
<div xx-scope="{ x:'local X'}">
	Access local var x = {{x}}<br>
	Access global var world = {{world}}
</div>
```

## xx-text

You can `xx-text` the result of an expression to the elements `el.innerText`.

```html
Hello <span xx-text="world"></span><span xx-text="'!'"></span>
```


## xx-for

Loop over an iterable collection of something and access the items in there on "xx-scope".

```html
<ul>
	<li xx-for="item of things.reverse()">
		The {{item.name}} is
		<span xx-style="{color: (item.color)}" xx-text="item.color"></span>.
	</li>
</ul>
<script>
var things = [
	{ name: 'banana', color: 'blue' },
	{ name: 'fox', color: 'brown'},
	{ name: 'ball', color: 'red' },
];
</script>
```

## xx-if

Yes, we have also an if:
```html
<div xx-scope="{ isCool: true }">
	Criss-Cross <span xx-if="isCool">is cool!</span>
</div>
```


## xx-style, xx-class

xx-style uses the key-value pairs of a js object as "style property" and "value". xx-class use
the keys as the "classname" and its value is an boolean expression for using or not using this "classname".


```html
<div xx-scope="{ isSelected: true, acolor: 'blue' }">
	<div xx-style="{width: '300px', color: acolor}" xx-class="{ selected: isSelected }">
		Criss-Cross
	</div>
</div>
```

## xx-prop

`xx-prop` bind to element properties. `xx-prop` expects an js-object. The
key names of this js-object are the element property names to assign to.

```html
<input xx-prop="{value: aValue}">
```

will do on every value change:

```js
elInput.value = aValue;
```

## xx-attr

`xx-attr` bind to element attributes. `xx-attr` expects an js-object. The
key names of this js-object are the element attribute names to assign to.

```html
<input xx-attr="{hint: aHint}">
```

will do on every value change:

```js
elInput.setAttribute('hint', aHint);
```

## xx-component

Define a new component with `<template xx-component="{name}">` and use it with its name `<{name}></{name}>`:
```html
<abc></abc>
<abc></abc>

<template xx-component="abc">
	<div>The quick brown fox jumps over the lazy dog.</div>
</template>
```


## Re-render

The HTML document will be rendered with Criss-Cross after the "DOMContentLoaded" event.
If the data/your model changes, you can re-render the DOM by calling `xx.render()` or
short just `xx()`. Only changed values will trigger a change on the HTML element. On
`xx-for` loops, the item identity operator ('===') is used to detect additions, deletions,
replacements and kept items. If only the item content changes, its HTML element only gets
an update.

```html
<div> It is: {{ new Date }}</div>
<script>setInterval(xx, 1000);</script>
```


## Installation

Use git:
```sh
git clone https://github.com/jensh/xxdomjs.git xxdom
```

Or npm:
```sh
npm install xxdom
```

## Online examples

Here is a [link to all above examples](https://4k2.de/xxdomjs/examples/readme.html) in action.
The other [examples](https://4k2.de/xxdomjs/examples/demo.html) from this repo.

Have fun!

We are interested in your thoughts!

Twitter: [@jens4321](https://twitter.com/jens4321)
