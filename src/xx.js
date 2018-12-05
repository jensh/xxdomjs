/*
 * Copyright (c) 2018 Jens Hauke. All rights reserved.
 *
 * 2018-11-28 Jens Hauke <jens@4k2.de>
 */

xx = (function () {
	'use strict';


	const s_del = 1;
	const s_add = 2;
	const s_replace = 3;
	const s_keep = 4;

	// Get an edit script which is okayisch, but suboptimal.
	// Could be O(n log n) if Map will be used and every entry
	// in ar1 or ar2 is unique in its array (no duplicates).
	function *array_diff(ar1, ar2) {
		/*
		// Map entries to index
		const m1 = new Map(ar1.map((e,i) => [e,i]).reverse()),
		      m2 = new Map(ar2.map((e,i) => [e,i]).reverse());
		const has_duplicates = (m1.size != ar1.length) || (m2.size != ar2.length);
		*/

		let i1 = 0, i2 = 0;
		let e1 = ar1[i1], e2 = ar2[i2];
		let x1 = -2, x2 = -2;
		while ((i1 < ar1.length) && (i2 < ar2.length)) {
			if (e1 === e2) {
				yield [ s_keep, e1, i1, i2 ];
				e1 = ar1[++i1]; x2 = -2;
				e2 = ar2[++i2]; x1 = -2;
			} else {
				/*
				const x1 = m1.get(e2); // index of e2 in ar1
				const x2 = m2.get(e1); // index of e1 in ar2
				if (has_duplicates) {
					if (x2 < i2) x2 = ar2.indexOf(e1, i2);
					if (x1 < i1) x1 = ar1.indexOf(e2, i1);
				}
				if (x2 < i2) x2 = undefined;
				if (x1 < i1) x1 = undefined;
				*/
				if (x1 == -2) x1 = ar1.indexOf(e2, i1);
				if (x2 == -2) x2 = ar2.indexOf(e1, i2);

				// proceed with the unknown or greedy with the one which looks smaller.
				if ((x2 == -1) || ((x1 != -1) && (x1 <= x2))) {
					if ((x1 != -1) /*|| !xxUseReplace*/) {
						// e1 unknown in ar2.
						yield [ s_del, e1, i1 ];
					} else {
						// e1 and e2 are unknown
						yield [ s_replace, e1, e2, i1, i2 ];
						e2 = ar2[++i2]; x1 = -2;
					}
					e1 = ar1[++i1]; x2 = -2;
				} else {
					// e2 unknown in ar1.
					yield [ s_add, e2, i2 ];
					e2 = ar2[++i2]; x1 = -2;
				}
			}
		}
		while (i1 < ar1.length) {
			yield [ s_del, e1, i1 ];
			e1 = ar1[++i1];
		}
		while (i2 < ar2.length) {
			yield [ s_add, e2, i2 ];
			e2 = ar2[++i2];
		}
	}


	function createChildScope(scope) {
		return Object.create(scope);
	}


	// Clone a DOM node including its xx properties
	function cloneNode(el, newScope) {
		const elRoot = el.cloneNode(true);
		const xxChildNodes = [];

		elRoot.xx = newScope
		xx.propagateScope(elRoot, newScope);

		return elRoot;
	}


	class XxFor {
		constructor(template, itemName, listFactory) {
			Object.assign(this, { template, itemName, listFactory});
		}

		render(marker, scope) {
			if (xx.debug) console.log('Exec For', this, marker, scope);

			const list = [...(this.listFactory.call(null, scope) || [])]; // Clone list-> Disallow mutation.-> Keep in sync with DOM

			const oldlist = marker.xxList || [];

			if (oldlist.length == 0) {
				// Fast path. Just create new nodes. (Initial exec or list was empty).
				const nodes = document.createDocumentFragment();
				for (const data of list) {
					nodes.appendChild(this._createChild(data, scope));
				}
				marker.parentNode.insertBefore(nodes, marker.nextSibling);
			} else {
				// Mutate old list into new list.
				let el = marker.nextSibling;
				const parentNode = marker.parentNode;

				for (const ed of array_diff(oldlist, list)) {
					let next = (ed[0] == s_add) ? el : el.nextSibling;

					switch (ed[0]) {
					case s_del: {
						if (xx.debug) console.log('xx-for: del item', el);
						parentNode.removeChild(el);
						break;
					}
					case s_add: {
						const newNode = this._createChild(ed[1] /* data */, scope);
						if (xx.debug) console.log('xx-for: add item', newNode, newNode.xxScope);
						parentNode.insertBefore(newNode, el);
						break;
					}
					case s_replace: {
						if (xx.debug) console.log('xx-for: replace item', el);
						if (xx.recycleDOMnodes) {
							this._updateChild(el, ed[2] /* data */);
						} else {
							const newNode = this._createChild(ed[2] /* data */, scope);
							parentNode.replaceChild(newNode, el);
						}
						break;
					}
					case s_keep:
						// if (xx.debug) console.log('xx-for: keep item', el);
						xx.renderNode(el);
						break;
					default:
						console.assert(false);
					}
					el = next;
				}
			}

			marker.xxList = list;
		}

		_createChild(data, scope) {
			const newScope = createChildScope(scope);
			const newNode = cloneNode(this.template, newScope);

			// newScope[this.itemName] = data;
			this._updateChild(newNode, data); // Call update before propagateScope!

			return newNode;
		}

		_updateChild(el, data) {
			const scope = el.xx;
			scope[this.itemName] = data;
			xx.renderNode(el);
		}
	};


	class XxBind {
		constructor(contentGenerator) {
			Object.assign(this, {contentGenerator});
		}

		render(el, scope) {
			const oldText = el.xxOldText; // assume reading el.xxOldText is faster than el.innerText.
			const newText = String(this.contentGenerator.call(el, scope));

			if (oldText != newText) { // Update DOM only if needed
				el.innerText = el.xxOldText = newText;
			}
		}
	}


	// Return a canonical Object
	// "className" -> { className: true}
	// ["cn1","cn2"] -> { cn1: true, cn2: true }
	// {} -> {}
	function cssCanonical(css) {
		if (css instanceof Array) {
			css = Object.assign(...css.map(x=>cssCanonical(x)));
		} else if (typeof css == 'string') {
			return { [css] : true };
		}
		if (!(css instanceof Object)) css = cssCanonical('' + css);
		return css;
	}


	class XxClass {
		constructor(cssGenerator) {
			Object.assign(this, {cssGenerator});
		}

		render(el, scope) {
			const cssRaw = this.cssGenerator();
			const css = cssCanonical(cssRaw);
			const oldCss = el.xxOldCss;// || [...el.classList]
			const both = Object.assign({}, oldCss, css);

			for (const cn in both) {
				const n = !!css[cn],
				      o = (oldCss ? oldCss[cn]: !n); // !oldCss: Force assignment on first step
				if (o != n) {
					(n) ? el.classList.add(cn) : el.classList.remove(cn);
					if (xx.debug) console.log(`${n?'Add':'Remove'} class "${cn}"`, el, cssRaw);
				}
			}
			el.xxOldCss = css;
		}
	}


	class XxFooMulti {
		constructor() {
			this.handler = [];
		}
		render(el, scope) {
			for (const h of this.handler) {
				h.render(el, scope);
			}
		}
	}


	function templateExpression(expressionString, el) {
		if (xx.debug) console.log('templateExpression', el, expressionString);
		const code = `with ($scope) return (${expressionString})`;
		try {
			const expr = Function("$scope", code);
			return function (scope) {
				try {
					return expr.call(this, scope||0);
				} catch (err) { // Expression errors
					console.log(`Expression: ${JSON.stringify(expressionString)}`, err, el, scope);
					return '';
				}
			}
		} catch(err) { // Parsing errors
			console.log(`xx-bind=${JSON.stringify(expressionString)}`, el);
			console.log(code, err);
			return function() { return '';};
		}
	}


	function funcFromAttr(el, attrName) {
		return templateExpression(el.getAttribute(attrName), el);
	}


	const xx = {
		debug: false,
		recycleDOMnodes: true, // Faster, but DOM nodes change scope on the fly (un-keyed)

		templateExpression,
		funcFromAttr,

		getAllChildNodes(rootnode = document) {
			return rootnode.xxChildNodes || (rootnode.xxChildNodes = rootnode.querySelectorAll('[xxfoo-id]'));
		},

		getAllXxFor(rootnode = document) {
			return rootnode.querySelectorAll('[xx-for]');
		},

		getAllXxBind(rootnode = document) {
			return rootnode.querySelectorAll('[xx-bind]');
		},

		getAllXxClass(rootnode = document) {
			return rootnode.querySelectorAll('[xx-class]');
		},

		getAllXxScope(rootnode = document) {
			return rootnode.querySelectorAll('[xx-scope]');
		},

		xxInstances: new Map,
		xxId: 0,

		getXxFromEl(el) {
			if (!el.xxFoo) {
				// cloned els loose there xxFoo. Get it again from its xxfoo-id.
				const id = el.getAttribute('xxfoo-id');
				el.xxFoo = this.xxInstances.get(id);
			}
			return el.xxFoo;
		},

		addXxFoo(el, xxFoo) {
			let foo = el.xxFoo;
			if (!foo) {
				el.xxFoo = foo = new XxFooMulti;

				let id = "" + this.xxId++;
				el.setAttribute('xxfoo-id', id);

				this.xxInstances.set(id, foo);
			}
			foo.handler.push(xxFoo);
		},

		_initXxFor(el) {
			const forStr = el.getAttribute('xx-for');
			const [, itemName, listFactoryStr] =
			      forStr.match(/([a-z_]\w*)\s+(?:of|in)\b\s*(.*)/i) || // '${varname} of ${expression}'
			      [, '$i', forStr ];
			const listFactory = templateExpression(listFactoryStr, el);

			const marker =  document.createElement('script');
			marker.type = 'xx-for-marker';
			marker.setAttribute('xxCode', `for (${forStr})…`);

			const template = el;
			template.removeAttribute('xx-for');

			el.parentNode.replaceChild(marker, el); // DOM: replace el/template by marker

			const xxFor = new XxFor(template, itemName, listFactory);

			this.addXxFoo(marker, xxFor);
		},

		_initXxFors() {
			for (const el of this.getAllXxFor()) {
				if (xx.debug) console.log('init xx-for@', el);
				this._initXxFor(el);
			}
		},

		_initXxBind(el) {
			this.addXxFoo(el, new XxBind(funcFromAttr(el, 'xx-bind')));
		},

		_initXxClass(el) {
			this.addXxFoo(el, new XxClass(funcFromAttr(el, 'xx-class')));
		},

		_initXxScope(el) {
			const scope = funcFromAttr(el, 'xx-scope')();
			this.propagateScope(el, scope);
		},

		_initXxBinds() {
			for (const el of this.getAllXxBind()) {
				if (xx.debug) console.log('init xx-bind@', el);
				this._initXxBind(el);
			}
		},

		_initXxClasss() {
			for (const el of this.getAllXxClass()) {
				if (xx.debug) console.log('init xx-class@', el);
				this._initXxClass(el);
			}
		},

		_initXxScopes() {
			for (const el of this.getAllXxScope()) {
				if (xx.debug) console.log('init xx-scope@', el);
				this._initXxScope(el);
			}
		},

		renderNode(rootnode) {
			for (const el of this.getAllChildNodes(rootnode)) {
				const xxFoo = this.getXxFromEl(el);
				const scope = el.xx;
				xxFoo.render(el, scope);
			}
		},

		propagateScope(rootnode, scope) {
			for (const el of this.getAllChildNodes(rootnode)) {
				if (xx.debug) console.log('Assign scope', el, scope);
				el.xx = scope;
			}
		},

		_initialized: false,

		init() {
			if (this._initialized) return;
			this._initialized = true;
			const rootScope = {};
			this._initXxBinds();
			this._initXxClasss();
			this._initXxFors();
			this.propagateScope(document, rootScope);
			this._initXxScopes();
		},

		render() {
			if (xx.debug) console.log('xx.render()');
			if (!this._initialized) this.init();
			this.renderNode(document);
		}
	};



	// Render all nodes after DOMContentLoaded
	try {
		if (document.readyState === "loading") {
			document.addEventListener("DOMContentLoaded", render);
		} else {  // `DOMContentLoaded` already fired
			render();
		}
		function render() {
			if (!xx.no_autostart) {
				xx.render();
			}
		}
	} catch (err) {
		console.log(err);
	}

	return xx;
}());
