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

		elRoot.$scope = newScope
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
						xx.renderTree(el);
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
			const scope = el.$scope;
			scope[this.itemName] = data;
			xx.renderTree(el);
		}
	};


	function listIfFilterFactory(itemName, listFactory, condition) {
		return (function *(scope) {
			const ifScope = createChildScope(scope);
			for (const item of listFactory(scope)) {
				ifScope[itemName] = item;
				if (condition(ifScope)) {
					yield item;
				}
			}
		});
	}


	class XxIf {
		constructor(template, condition) {
			Object.assign(this, { template, condition});
		}

		render(marker, scope) {
			if (xx.debug) console.log('Exec If', this, marker, scope);

			const cond = !! this.condition(scope);
			const oldcond = !! marker.xxCond;
			const child = marker.childEl || (marker.childEl = this._createChild(scope));

			if (cond != oldcond) {
				if (cond) {
					marker.parentNode.insertBefore(child, marker.nextSibling);
				} else {
					child.remove();
					// Loose el with scope. Refresh tree later.
					// This fixes checkbox.checked "if expressions"
					// hiding a checkbox.
					delete marker.childEl;
				}
				marker.xxCond = cond;
			}
			if (cond) {
				xx.renderTree(child);
			}
		}

		_createChild(scope) {
			return cloneNode(this.template, createChildScope(scope));
		}
	};


	class XxText {
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


	class XxBind {
		constructor(contentGenerator) {
			Object.assign(this, {contentGenerator});
		}

		render(el, scope) {
			const oldBind = el.xxBind || {};
			const newBind = this.contentGenerator.call(el, scope);

			try {
				for (const an in newBind) {
					const o = oldBind[an], n = newBind[an];
					if (o != n) {
						switch (an[0]) {
						case '$':
							// Set el attribute
							if (xx.debug) console.log(`xx-bind el.setAttribute("${an.substr(1)}", ${n})`, el);
							el.setAttribute(an.substr(1), n);
						default:
							// Set el property
							if (xx.debug) console.log(`xx-bind el.${an} = ${n}`, el);
							el[an] = n;
							break;
						}
					}
				}
				el.xxBind = newBind;
			} catch (err) {
				console.log(`xxBind error`, el, newBind, err);
			}
		}
	}


	class XxComponent {
		constructor(template) {
			this.template = template;
		}

		paste(elTarget) {
			elTarget.innerHTML = this.template.innerHTML;
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
			const cssRaw = this.cssGenerator(scope);
			const css = cssCanonical(cssRaw);
			const oldCss = el.xxOldCss;// || [...el.classList]
			const both = Object.assign({}, oldCss, css);

			for (const cn in both) {
				const n = !!css[cn],
				      o = (oldCss ? oldCss[cn]: !n); // !oldCss: Force assignment on first step
				if (!cn) continue;
				if (o != n) {
					try {
						if (xx.debug) console.log(`${n?'Add':'Remove'} class "${cn}"`, el, cssRaw);
						(n) ? el.classList.add(cn) : el.classList.remove(cn);
					} catch (err) {
						console.log(`${n?'Add':'Remove'} class "${cn}"`, el, cssRaw, err);
					}
				}
			}
			el.xxOldCss = css;
		}
	}


	class XxStyle {
		constructor(styleGenerator) {
			Object.assign(this, {styleGenerator});
		}

		render(el, scope) {
			const style = xx.styleFilter(this.styleGenerator(scope));
			const oldStyle = el.xxStyle || {};

			for (const sName in style) {
				const sValue = style[sName];
				const oldSValue = oldStyle[sName];

				if (sValue != oldSValue) {
					el.style[sName] = sValue;
					if (xx.debug) console.log(`Update style ${sName}: ${sValue}`, el);
				}
			}
			el.xxStyle = style;
		}
	}


	class XxHandlebar {
		constructor(contentGenerator) {
			Object.assign(this, {contentGenerator});
		}

		render(el, scope) {
			const oldText = el.xxOldText;
			const newText = String(this.contentGenerator.call(el, scope));

			if (oldText != newText) { // Update DOM only if needed
				el.nextSibling.textContent = el.xxOldText = newText;
			}
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
		if (!expressionString) return emptyFunc;
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
			console.log(`Expression: ${JSON.stringify(expressionString)}`, el);
			console.log(code, err);
			return emptyFunc;
		}
		function emptyFunc() { return '';};
	}


	function funcFromAttr(el, attrName) {
		return templateExpression(el.getAttribute(attrName), el);
	}


	let xx = {
		debug: false,
		recycleDOMnodes: true, // Faster, but DOM nodes change scope on the fly (un-keyed)

		templateExpression,
		funcFromAttr,
		components: new Map,

		getAllChildNodes(rootnode = document) {
			return rootnode.xxChildNodes || (rootnode.xxChildNodes = rootnode.querySelectorAll('[xxfoo-id]'));
		},


		getAllXxScope(rootnode = document) {
			return
		},

		*getAllXxHandlebarNodes(rootnode = document.body) {
			const walker = document.createNodeIterator(
				rootnode, NodeFilter.SHOW_TEXT,
				el => (/{{.*}}/.test(el.textContent))
					? NodeFilter.FILTER_ACCEPT
					: NodeFilter.FILTER_REJECT
			);
			for (let el; el = walker.nextNode();) {
				yield el;
			}
		},

		xxInstances: new Map,
		xxId: 0,

		getXxFromEl(el) {
			if (!el.xxFoo) {
				// cloned els loose there xxFoo. Get it again from its xxfoo-id.
				if (!el.getAttribute) return; // e.g document
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

		_initXxComponent(el) {
			const name = el.getAttribute('xx-component');
			this.components.set(name, new XxComponent(el));
		},

		_initXxForOrIf(el) {
			if (xx.debug) console.log('init xx-for/xx-if@', el);
			const forStr = el.getAttribute('xx-for');
			const ifStr = el.getAttribute('xx-if');
			let ifCondition;
			const marker =  document.createElement('script');
			const template = el;

			if (ifStr) {
				template.removeAttribute('xx-if');
				ifCondition = templateExpression(ifStr, el);
			}
			if (forStr) {
				template.removeAttribute('xx-for');
				const [, itemName, listFactoryStr] =
				      forStr.match(/([a-z_]\w*)\s+(?:of|in)\b\s*(.*)/i) || // '${varname} of ${expression}'
				      [, '$i', forStr ];
				let listFactory = templateExpression(listFactoryStr, el);

				if (ifCondition) {
					// xx-for and xx-if combined on one element
					listFactory = listIfFilterFactory(itemName, listFactory, ifCondition);
					marker.type = 'xx-for-if-marker';
					marker.setAttribute('xxCode', `for (${forStr}) if (${ifStr})…`);
				} else {
					marker.type = 'xx-for-marker';
					marker.setAttribute('xxCode', `for (${forStr})…`);
				}


				this.addXxFoo(marker, new XxFor(template, itemName, listFactory));
			} else {
				marker.type = 'xx-if-marker';
				marker.setAttribute('xxCode', `if (${ifStr})…`);

				this.addXxFoo(marker, new XxIf(template, ifCondition));
			}

			el.parentNode.replaceChild(marker, el); // DOM: replace el/template by marker
		},

		_initXxText(el) {
			if (xx.debug) console.log('init xx-text@', el);
			this.addXxFoo(el, new XxText(funcFromAttr(el, 'xx-text')));
		},

		_initXxBind(el) {
			if (xx.debug) console.log('init xx-bind@', el);
			this.addXxFoo(el, new XxBind(funcFromAttr(el, 'xx-bind')));
		},

		_initXxClass(el) {
			if (xx.debug) console.log('init xx-class@', el);
			this.addXxFoo(el, new XxClass(funcFromAttr(el, 'xx-class')));
		},


		styleFilter(style) {
			// ToDo: Optionally supply vendor prefixes
			return style instanceof Object ? style : {};
		},

		_initXxStyle(el) {
			if (xx.debug) console.log('init xx-style@', el);
			this.addXxFoo(el, new XxStyle(funcFromAttr(el, 'xx-style')));
		},

		_initXxScope(el) {
			if (xx.debug) console.log('init xx-scope@', el);
			const scope = funcFromAttr(el, 'xx-scope')();
			this.propagateScope(el, scope);
		},

		_initXxHandlebar(el) {
			if (xx.debug) console.log('init {{}}@', el);
			// ToDo: We need some tests here!!!
			const templateStr = el.textContent
			      .replace(/{{(.*?)}}/g, (_,exp) => '${'+exp+'}'); // Transform {{expr}} into ${expr}

			const contentGen = templateExpression('`'+templateStr+'`', el);

			const marker =  document.createElement('script');
			marker.type = 'xx-handlebar-marker';

			el.parentNode.insertBefore(marker, el); // Manipulate textnode after marker

			this.addXxFoo(marker, new XxHandlebar(contentGen));
		},

		renderNode(el) {
			const xxFoo = this.getXxFromEl(el);
			if (xxFoo) xxFoo.render(el, el.$scope);
		},

		renderTree(rootnode) {
			this.renderNode(rootnode);

			for (const el of this.getAllChildNodes(rootnode)) {
				this.renderNode(el);
			}
		},

		propagateScope(rootnode, scope) {
			rootnode.$scope = scope;
			for (const el of this.getAllChildNodes(rootnode)) {
				if (xx.debug) console.log('Assign scope', el, scope);
				el.$scope = scope;
			}
		},

		_initTree(root = document, rootScope = window) {
			// components first
			for (const el of root.querySelectorAll('[xx-component]')) {
				this._initXxComponent(el);
			}

			for (const [cname,comp] of [...this.components].reverse()) {
				for (const el of root.querySelectorAll(cname)) {
					comp.paste(el);
				}
			}

			for (const el of root.querySelectorAll('[xx-text]')) {
				this._initXxText(el);
			}
			for (const el of root.querySelectorAll('[xx-bind]')) {
				this._initXxBind(el);
			}
			for (const el of root.querySelectorAll('[xx-class]')) {
				this._initXxClass(el);
			}
			for (const el of root.querySelectorAll('[xx-style]')) {
				this._initXxStyle(el);
			}
			for (const el of this.getAllXxHandlebarNodes(root)) {
				this._initXxHandlebar(el);
			}

			// ^templates must be initialized before initializing for/if control structures!

			for (const el of root.querySelectorAll('[xx-for],[xx-if]')) {
				this._initXxForOrIf(el);
			}

			// Initialize the scopes last

			this.propagateScope(root, rootScope);

			for (const el of root.querySelectorAll('[xx-scope]')) {
				this._initXxScope(el);
			}
		},

		_initialized: false,

		init(root=document, rootScope=window) {
			if (this._initialized) return;
			this._initialized = true;

			if (xx.debug) console.log('xxdom Initialize', root);

			this._initTree(root, rootScope);
		},

		render() {
			if (!this._initialized) this.init();
			if (xx.debug) console.log('xx.render()');
			this.renderTree(document);
		}
	};


	try {
		xx.noinit = document.currentScript.src.indexOf('#noinit') > 0;
		xx.debug = document.currentScript.src.indexOf('#debug') > 0;
	} catch (err) {
	}

	// Render all nodes after DOMContentLoaded
	try {
		if (document.readyState === "loading") {
			document.addEventListener("DOMContentLoaded", render);
		} else {  // `DOMContentLoaded` already fired
			render();
		}
		function render() {
			if (!xx.noinit) {
				xx.render();
			}
		}
	} catch (err) {
		console.log(err);
	}

	function render() {
		// Calling xx() is forwarded to xx.render().
		xx.render();
	}

	return xx = Object.assign(render, xx);
}());
