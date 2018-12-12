# xxdom.js
Criss-cross incremental DOM renderer


# Jump start

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

You can play with the code online [on jsfiddle.net](https://jsfiddle.net/jensh/8k93yzat/13/).

Here is a [link to all above examples](https://4k2.de/xxdomjs/examples/readme.html) in action.
The other [examples](https://4k2.de/xxdomjs/examples/) from this repo.

Have fun!

We are interested in your thoughts!

Twitter: [@jens4321](https://twitter.com/jens4321)
