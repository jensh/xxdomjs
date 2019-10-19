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

	function deb(...args) {
		if (xx.debug) console.log(...args);
	}

	function elog(...args) {
		console.log(...args);
	}

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
		constructor(el, gen) {
			Object.assign(this, {el, gen:gen || (()=>'')});
		}

		getVal(scope) {
			return this.gen.call(this.el, scope);
		}

		newEl(el) {
			return Object.assign(Object.create(this), {el});
		}
	}


	class XxFor extends XxBase {
		constructor(marker, gen, itemName, tmpl) {
			super(marker, gen);
			Object.assign(this, {itemName, tmpl});
		}

		render(scope) {
			const list = [...(this.getVal(scope) || [])], // Clone list-> Disallow mutation.-> Keep in sync with DOM
			      oldlist = this.old || [],
			      chld = this.chld || (this.chld = []),
			      itemName = this.itemName,
			      tmpl = this.tmpl;

			if (oldlist.length == 0) {
				// Fast path. Just create new nodes. (Initial exec or list was empty).
				const nodes = document.createDocumentFragment();
				for (const data of list) {
					const newNode = createChild(data);
					nodes.appendChild(newNode.el);
					chld.push(newNode);
				}
				renderAll();
				elInsertAfter(this.el, nodes);
			} else {
				// Mutate old list into new list.
				const parentNode = this.el.parentNode;
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
						const newNode = createChild(ed[1] /* data */);
						deb('xx-for: add item', newNode);
						parentNode.insertBefore(newNode.el, el);
						chld.splice(cpos++, 0, newNode); // ins
						break;
					}
					case s_replace: {
						deb('xx-for: replace item', el);
						if (xx.recycleDOMnodes && !this.tmpl.tmpl /* instanceof XXTmpl? */ ) {
							chld[cpos++].scope[this.itemName] = ed[2];
						} else {
							const newNode = createChild(ed[2] /* data */);
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
				renderAll();
			}
			this.old = list;

			function renderAll() {
				for (const c of chld) c.render();
			}

			function createChild(data) {
				const s = createChildScope(scope);
				s[itemName] = data;
				return tmpl.clone(s);
			}
		}
	}


	class XxIf extends XxBase {
		constructor(marker, ifCondition, tmpl) {
			super(marker, ifCondition);
			this.tmpl = tmpl;
			this.old = false;
		}

		render(scope) {
			let cond = !! this.getVal(scope),
			    c = (this.chld || (this.chld = []))[0],
			    ce;

			if (cond != this.old) {
				this.old = cond;

				// Assign scope on demand:
				c || (c = this.chld[0] = this.tmpl.clone(scope));

				cond	? elInsertAfter(this.el, c.el)
					: this.el.parentNode.removeChild(c.el);
			}
			if (cond) c.render(scope);
		}
	};


	class XxComponent {
		constructor(el) {
			(this.tmpl = document.createDocumentFragment()).appendChild(el);
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
			return el;
		}
	}


	class XxText extends XxBase {
		render(scope) {
			const newText = String(this.getVal(scope));

			if (this.old != newText) { // Update DOM only if needed
				this.el.innerText = this.old = newText;
			}
		}
	}


	class XxAttr extends XxBase {
		render(scope) {
			const old = this.old || (this.old = {}),
			      cur = this.getVal(scope);
			if (cur) for (const name in cur) {
				const o = old[name], c = cur[name];
				if (o != c) {
					old[name] = c;
					this.el.setAttribute(name, c);
				}
			}
		}
	}


	class XxProp extends XxBase {
		render(scope) {
			const old = this.old || (this.old = {}),
			      cur = this.getVal(scope);
			if (cur) for (const name in cur) {
				const o = old[name], c = cur[name];
				if (o != c) {
					this.el[name] = old[name] = c;
				}
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


	class XxClass extends XxBase {
		render(scope) {
			const cssRaw = this.getVal(scope),
			      css = cssCanonical(cssRaw),
			      oldCss = this.old, // || [...el.classList]
			      el = this.el,
			      both = Object.assign({}, oldCss, css);

			for (const cn in both) {
				const n = !!css[cn],
				      o = (oldCss ? oldCss[cn]: !n); // !oldCss: Force assignment on first step
				if (!cn) continue;
				if (o != n) {
					deb(`${n?'Add':'Remove'} class "${cn}"`, el, cssRaw);
					(n) ? el.classList.add(cn) : this.el.classList.remove(cn);
				}
			}
			el.old = css;
		}
	}


	class XxStyle extends XxBase {
		render(scope) {
			const style = this.getVal(scope) || {},
			      oldStyle = this.old || (this.old = {});
			for (const sName in style) {
				const sValue = style[sName];
				const oldSValue = oldStyle[sName];
				if (sValue != oldSValue) {
					oldStyle[sName] = this.el.style[sName] = sValue;
					deb(`Update style ${sName}: ${sValue}`, this.el);
				}
			}
		}
	}


	class XxHandlebar extends XxBase {
		render(scope) {
			const newText = String(this.getVal(scope));

			if (this.old != newText) { // Update DOM only if needed
				this.el.textContent = this.old = newText;
			}
		}

		newEl(el) {
			return XxBase.prototype.newEl.call(
				this,
				elReplaceChild(document.createTextNode(this.old = ""), el));
		}
	}


	const xxComps = {};

	class XxTmpl extends XxBase {
		clone(scope) {
			this.tmpl = this.el.content;

			const name = this.getVal(scope),
			      c = xxComps[name] || (
				      elog(`xx-tmpl="${name}" not found`),
				      this // Fallback to this.el.content
			      );

			return (c.tree || (c.tree = scan(null, c.tmpl))).clone(scope);
		}
	}


	function scan(tree, el, scope) {
		if (!tree) (tree = new XxTree(el)).scope = scope;

		const chld = tree.chld = [];

		document.createNodeIterator(
			el, 5 /* = NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT*/,
			el => {
				if (el.nodeType == 3 /* TEXT_NODE */) {
					if (/{{.*}}/.test(el.textContent)) {
						initXxHandlebar(el);
					}
					return 2; // FILTER_REJECT
				} else {
					let ex = elGetAndDelAttrExpression(el, "xx-scope"),
					    xxFoo;
					if (ex) {
						chld.push(xxFoo = new XxTree(el, ex));
						scan(xxFoo, el, scope && xxFoo.initScope(scope));

						return 2; // FILTER_REJECT
					}

					/*
					 * controls
					 */
					if (elGetAndDelAttribute(el, "xx-ctrl") == "") {
						const c = el.content.firstElementChild, // template
						      forStr = elGetAndDelAttribute(c, "xx-for"),
						      ifCondition = elGetAndDelAttrExpression(c, "xx-if"),
						      tmplSelect = elGetAndDelAttrExpression(c, "xx-tmpl"),
						      t = tmplSelect ? new XxTmpl(el, tmplSelect) : scan(null, c)

						if (forStr) {
							const [, itemName, listFactoryStr] =
							      forStr.match(/([a-z_]\w*)\s+(?:of|in)\b\s*(.*)/i) || // '${varname} of ${expression}'
							      [, '$i', forStr ];
							let listFactory = templateExpression(listFactoryStr, c);

							if (ifCondition) {
								// xx-for and xx-if combined on one element
								listFactory = listIfFilterFactory(itemName, listFactory, ifCondition);
							}
							chld.push(new XxFor(el, listFactory, itemName, t));
						} else {
							chld.push(new XxIf(el, ifCondition || (()=>true), t));
						}
					} else {
						/*
						 * xx-*
						 */
						for (const [xclass, xattr] of [
							[XxText, "xx-text"], [XxAttr, "xx-attr"], [XxProp, "xx-prop"],
							[XxClass, "xx-class"], [XxStyle, "xx-style"]]) {
							const ex =  elGetAndDelAttrExpression(el, xattr);
							if (ex) chld.push(new xclass(el, ex));
						}
					}

					// return 1: // FILTER_ACCEPT
					return 3; // FILTER_SKIP
				}
			}).nextNode();

		if (!scope) {
			// Assign a tree id to each used el
			[...new Set(chld.map(n => n.el))].forEach((el, i) => {
				el.setAttribute("xx-tree", i);
			});
		}

		return tree;


		function initXxHandlebar(el) {
			const templateStr = el.textContent = el.textContent
			      .replace(/{{(.*?)}}/g, (_,exp) => '${'+exp+'}'); // Transform {{expr}} into ${expr}
			const contentGen = templateExpression('`'+templateStr+'`', el);
			if (!scope) {
				// Replace TEXT_NODE by an ELEMENT_NODE
				el = elReplaceChild(document.createElement("template"), el);
			}
			chld.push(new XxHandlebar(el, contentGen));
		}

	}

	class XxTree extends XxBase {
		render() {
			for (const node of this.chld) try {
				node.render(this.scope);
			} catch (err) {
				elog(err, node);
			}
		}

		clone(scope) {
			const ntree = new XxTree(this.el.cloneNode(true));
			ntree.scope = scope;

			// Construct from tree template
			const idMap = [];

			// idMap[tree id] -> new el
			for (const el of ntree.el.querySelectorAll("[xx-tree]")) {
				idMap[el.getAttribute("xx-tree")] = el;
			}

			walk(ntree, this, scope);

			return ntree;

			function walk(ntree, otree, scope) {
				ntree.chld = [];
				// Map chld by tree id
				for (const n of otree.chld) {
					let ctree;
					ntree.chld.push(ctree = n.newEl(
						idMap[n.el.getAttribute("xx-tree")]));
					if (n.chld) {
						walk(ctree, n, ctree.initScope(scope));
					}
				}
			}
		}

		initScope(parentScope) {
			return this.scope = this.getVal(parentScope);
		}
	}


	function templateExpression(exStr, el) {
		if (!exStr) return null;
		deb("Expr", el, exStr);
		const code = `with ($scope) return (${exStr})`;
		try {
			const expr = Function("$scope", code);
			return function (scope) {
				try {
					return expr.call(this, scope||0);
				} catch (err) { // Expression errors
					elog(`Expr: ${exStr}`, err, el, scope);
					return '';
				}
			}
		} catch(err) { // Parsing errors
			elog(`Expr: ${exStr}`, el, code, err);
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


	function initComponents(root) {
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
	}


	function initFors(root) {
		for (const el of root.querySelectorAll('[xx-for],[xx-if],[xx-tmpl]')) {
			const t = document.createElement("template");
			elReplaceChild(t, el); // DOM: replace el by template
			t.content.append(el);
			t.setAttribute("xx-ctrl", "");
		}
	}


	let xx = Object.assign(render, {
		debug: false,
		noinit: false,
		recycleDOMnodes: true, // Faster, but DOM nodes change scope on the fly (un-keyed)


		init(root=document, scope=window) {
			delete this.init; // call init only once
			deb('xx.init()');
			initComponents(root);
			initFors(root);
			this.tree = scan(null, root, scope);
		},

		render() {
			if (this.init) this.init();
			deb('xx.render()');
			this.tree.render();
		},

		// Return scope of element el
		scope(el) {
			deb("xx.scope()", el);
			const elChain = new Set;
			while (elChain.add(el), el = el.parentNode);

			return find(this.tree).scope;

			function find(xxFoo) {
				for (const n of xxFoo.chld) if (n.chld) {
					const r = find(n);
					if (r) return r;
				}
				return xxFoo.scope && elChain.has(xxFoo.el) && xxFoo;
			}
		}
	});

	let rsched;
	function render(wait) {
		try {
			if (wait === undefined) {
				xx.render();
			} else if (!rsched) {
				rsched = setTimeout(() => {
					rsched = false;
					render();
				}, wait);
			}
		} catch (err) {
			elog(err);
		}
	}


	try {
		const src = document.currentScript.src;
		xx.noinit = src.indexOf('#noinit') > 0;
		xx.debug = src.indexOf('#debug') > 0;

		// Hack?
		Object.defineProperty(HTMLElement.prototype, "$scope", {
			get() {
				render(0); // render in next tick
				return xx.scope(this);
			}
		});
	} catch (err) {
	}

	// Render all nodes after DOMContentLoaded
	if (!xx.noinit) {
		if (document.readyState === "loading") {
			document.addEventListener("DOMContentLoaded", xx);
		} else {  // `DOMContentLoaded` already fired
			xx(0);
		}
	}


	return xx;
}());
