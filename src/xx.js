/*
 * Copyright (c) 2018, 2019 Jens Hauke. All rights reserved.
 *
 * 2018-11-28 Jens Hauke <jens@4k2.de>
 *
 * Criss-cross incremental DOM renderer
 * xxdom  https://github.com/jensh/xxdomjs
 *
 * Released under the MIT License.
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


	class XxBase {
		constructor(el, scope, gen) {
			Object.assign(this, {el, scope, gen});
		}

		getVal() {
			return this.gen.call(this.el, this.scope);
		}

		newScope(el, scope) {
			return Object.assign(Object.create(this), {el, scope});
		}
	}


	class XxFor extends XxBase {
		constructor(marker, scope, gen, itemName, template) {
			super(marker, scope, gen);
			Object.assign(this, {itemName, template});
			this.children = [];
		}

		render() {
			const list = [...(this.getVal() || [])]; // Clone list-> Disallow mutation.-> Keep in sync with DOM

			const oldlist = this.old || [];

			if (oldlist.length == 0) {
				// Fast path. Just create new nodes. (Initial exec or list was empty).
				const nodes = document.createDocumentFragment();
				for (const data of list) {
					const newNode = this._createChild(data);
					nodes.appendChild(newNode.el);
					this.children.push(newNode);
				}
				elInsertAfter(this.el, nodes);
			} else {
				// Mutate old list into new list.
				const parentNode = this.el.parentNode,
				      chld = this.children;
				let el = this.el.nextSibling,
				    cpos = 0;

				for (const ed of array_diff(oldlist, list)) {
					let next = (ed[0] == s_add) ? el : el.nextSibling;

					switch (ed[0]) {
					case s_del: {
						deb('xx-for: del item', el);
						parentNode.removeChild(el);
						chld.splice(cpos, 1); // del
						break;
					}
					case s_add: {
						const newNode = this._createChild(ed[1] /* data */);
						deb('xx-for: add item', newNode);
						parentNode.insertBefore(newNode.el, el);
						chld.splice(cpos++, 0, newNode); // ins
						break;
					}
					case s_replace: {
						deb('xx-for: replace item', el);
						if (xx.recycleDOMnodes /* && !this.template.xxCloneNode */) {
							const n = chld[cpos++];
							console.log(n);
							n.scope[this.itemName] = ed[2];
							n.render();
						} else {
							const newNode = this._createChild(ed[2] /* data */);
							parentNode.replaceChild(newNode.el, el);
							chld[cpos++] = newNode;
						}
						break;
					}
					case s_keep:
						deb('xx-for: keep item', el);
						chld[cpos++].render();
						break;
					}
					el = next;
				}
			}
			this.old = list;
		}

		_createChild(data) {
			const s = createChildScope(this.scope);
			s[this.itemName] = data;
			const t = this.template.clone(s);
			t.render();
			return t;
		}
	};


	class XxIf extends XxBase {
		constructor(marker, scope, ifCondition, template) {
			super(marker, scope, ifCondition);
			this.child = template;
			this.old = false;
		}

		render() {
			const cond = !! this.getVal();

			if (cond != this.old) {
				this.old = cond;
				if (cond) {
					 // Assign scope on demand. Remember first node of DocumentFragment child.el.
					if (!this.elOpt) this.elOpt = (this.child = this.child.clone(this.scope)).el.firstElementChild;
					elInsertAfter(this.el, this.elOpt);
				} else {
					this.el.parentNode.removeChild(this.elOpt);
				}
			}
			if (cond) this.child.render();
		}

		_createChild(scope) {
			return cloneNode(this.template, scope);
		}
	};


	class XxComponent {
		constructor(el) {
			this.tmpl = document.createDocumentFragment();
			this.tmpl.appendChild(el);
		}

		paste(elTarget) {
			const el = this.tmpl.firstElementChild.cloneNode(true);
			elReplaceChild(el, elTarget);

			// Copy attributes to new node
			for (const attr of elTarget.attributes) {
				let v = attr.value;
				switch (attr.name) {
				case 'class':
					v += ' ' + el.getAttribute('class'); // append tmpl class names
					break;
				}
				el.setAttribute(attr.name, v);
			}
		}
	}


	class XxText extends XxBase {
		render() {
			const newText = String(this.getVal());

			if (this.old != newText) { // Update DOM only if needed
				this.el.innerText = this.old = newText;
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
							break;
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


	class XxTemplate {
		constructor(tmpl) {
			this.tmpl = tmpl;
		}

		insertAfter(elMarker, scope) {
			const el = this.tmpl.cloneNode(true);
			el.$scope = scope;

			for (const c of [el, ...el.querySelectorAll("[xxfoo-id]")]) {
				const xxFoo = getXxFoo(c);
				if (xxFoo) {

				}
			}
		}

		_createChild(scope) {
			return cloneNode(this.template, scope);
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
			const cssRaw = this.cssGenerator.call(el, scope);
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
			const style = xx.styleFilter(this.styleGenerator.call(el, scope));
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


	class XxHandlebar extends XxBase {
		render() {
			const newText = String(this.getVal());

			if (this.old != newText) { // Update DOM only if needed
				this.el.textContent = this.old = newText;
			}
		}

		newScope(el, scope) {
			return XxBase.prototype.newScope.call(
				this,
				elReplaceChild(document.createTextNode(this.old = ""), el),
				scope);
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


	function forAllXxHandlebars(root, call) {
		const walker = document.createNodeIterator(
			root, NodeFilter.SHOW_TEXT,
			el => (/{{.*}}/.test(el.textContent))
				? NodeFilter.FILTER_ACCEPT
				: NodeFilter.FILTER_REJECT
		);
		for (let el; el = walker.nextNode();) {
			call(el);
		}
	}

	class XxTree {
		init(root, scope) {
			Object.assign(this, {el: root, scope});
			const nodes = this.nodes = [];

			/*
			 * controls
			 */
			for (const el of root.querySelectorAll("template[xx-ctrl]")) {
				const t = (new XxTree).init(el.content, null),
				      c = el.content.firstElementChild, // template
				      forStr = elGetAndDelAttribute(c, "xx-for"),
				      ifCondition = elGetAndDelAttrExpression(c, "xx-if");
				// const tmplSelect = elGetAndDelAttrExpression(el, "xx-tmpl");

				if (forStr) {
					const [, itemName, listFactoryStr] =
					      forStr.match(/([a-z_]\w*)\s+(?:of|in)\b\s*(.*)/i) || // '${varname} of ${expression}'
					      [, '$i', forStr ];
					let listFactory = templateExpression(listFactoryStr, c);

					if (ifCondition) {
						// xx-for and xx-if combined on one element
						listFactory = listIfFilterFactory(itemName, listFactory, ifCondition);
					}
					nodes.push(new XxFor(el, scope, listFactory, itemName, t));
				} else {
					nodes.push(new XxIf(el, scope, ifCondition, t));
				}
			}

			/*
			 * xx-text
			 */
			for (const el of root.querySelectorAll("[xx-text]")) {
				nodes.push(new XxText(el, scope, elGetAttrExpression(el, "xx-text")));
			}


			/*
			 * {{}}
			 */
			forAllXxHandlebars(root, initXxHandlebar);

			function initXxHandlebar(el) {
				const templateStr = el.textContent
				      .replace(/{{(.*?)}}/g, (_,exp) => '${'+exp+'}'); // Transform {{expr}} into ${expr}
				const contentGen = templateExpression('`'+templateStr+'`', el);
				if (!scope) {
					// Replace TEXT_NODE by an ELEMENT_NODE
					el = elReplaceChild(document.createElement("template"), el);
				}
				nodes.push(new XxHandlebar(el, scope, contentGen));
			}


			if (!scope) {
				nodes.forEach((n, i) => {
					n.el.setAttribute("xx-tree", i);
				});
			}
			return this;
		}

		render() {
			for (const node of this.nodes) {
				node.render();
			}
		}

		clone(scope) {
			const ntree = new XxTree,
			      nnodes = ntree.nodes = [],
			      nroot = ntree.el = this.el.cloneNode(true);
			ntree.scope = scope;

			for (const el of nroot.querySelectorAll("[xx-tree]")) {
				const idx = el.getAttribute("xx-tree");
				nnodes[idx] = this.nodes[idx].newScope(el, scope);
			}
			return ntree;
		}
	}

	function templateExpression(expressionString, el) {
		if (!expressionString) return null;
		deb('expr', expressionString, el);
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
			return null;
		}
	}


	function elGetAndDelAttribute(el, attrName) {
		const val = el.getAttribute(attrName);
		el.removeAttribute(attrName);
		return val;
	}


	function elGetAndDelAttrExpression(el, attrName) {
		return templateExpression(elGetAndDelAttribute(el, attrName));
	}


	function elGetAttrExpression(el, attrName) {
		return templateExpression(el.getAttribute(attrName), el);
	}



	function elInsertAfter(marker, elNew) {
		marker.parentNode.insertBefore(elNew, marker.nextSibling);
	}

	function elReplaceChild(elNew, elOld) {
		elOld.parentNode.replaceChild(elNew, elOld);
		return elNew;
	}

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

	const xxFoos = [],
	      xxComps = {};

	function getXxFoo(el) {
		return el.xxFoo || (
			// cloned els loose there xxFoo. Get it again from its xxfoo-id.
			el.xxFoo = xxFoos[el.getAttribute("xxfoo-id")|0 - 1]
		);
	}

	function addXxFoo(el, xxBar) {
		if (!el.xxFoo) {
			xxFoos.push(el.xxFoo = new XxFooMulti);
			el.setAttribute('xxfoo-id', xxFoos.length);
		}
		el.xxFoo.handler.push(xxBar);
	}


	let xx = {
		debug: false,
		noinit: false,
		recycleDOMnodes: true, // Faster, but DOM nodes change scope on the fly (un-keyed)

		_initComponents(root) {
			// init Components
			for (const el of root.querySelectorAll('[xx-component]')) {
				const name = elGetAndDelAttribute(el, "xx-component");
				let tmpl = (el.content && el.content.firstElementChild) || el;
				xxComps[name] = new XxComponent(tmpl); // register
			}

			// Expand components inside components and inside root
			[...Object.values(xxComps), {tmpl: root}].forEach(t => {
				for (const [cname, comp] of Object.entries(xxComps)) {
					// Use lowercase tag names to work also within SVG
					for (const el of t.tmpl.querySelectorAll(cname.toLowerCase())) {
						comp.paste(el);
					}
				}
			});
		},


		_initFors(root) {
			for (const el of root.querySelectorAll('[xx-for],[xx-if],[xx-tmpl]')) {
				const t =  document.createElement("template");
				elReplaceChild(t, el); // DOM: replace el by template
				t.content.append(el);
				t.setAttribute("xx-ctrl", "");
			}
		},

		init(root=document, scope=window) {
			delete this.init; // call init only once
			deb('xx.init()');
			this._initComponents(root);
			this._initFors(root);
			this.tree = (new XxTree).init(root, scope);
		},

		render() {
			if (this.init) this.init();
			deb('xx.render()');
			this.tree.render();
		}
	};

	function deb(...args) {
		if (xx.debug) console.log(...args);
	}

	try {
		xx.noinit = document.currentScript.src.indexOf('#noinit') > 0;
		xx.debug = document.currentScript.src.indexOf('#debug') > 0;
	} catch (err) {
	}

	// Render all nodes after DOMContentLoaded
	if (!xx.noinit) {
		if (document.readyState === "loading") {
			document.addEventListener("DOMContentLoaded", render);
		} else {  // `DOMContentLoaded` already fired
			render();
		}
	}

	function render() {
		try {
			// Calling xx() is forwarded to xx.render().
			xx.render();
		} catch (err) {
			console.log(err);
		}
	}

	return xx = Object.assign(render, xx);
}());
