const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

test('top navigation places its slot before the complete Prime wrapper, not inside its tooltip', () => {
  class Element {
    constructor() { this.children = []; this.isConnected = true; }
    append(node) { node.parentElement = this; this.children.push(node); }
    contains(node) { return this === node || this.children.some(child => child.contains(node)); }
    querySelectorAll() { return this.children.flatMap(child => [child, ...child.querySelectorAll()]).filter(child => child.peer); }
    matches() { return false; }
    insertBefore(node, reference) {
      if (node.parentElement) node.parentElement.children = node.parentElement.children.filter(child => child !== node);
      node.parentElement = this; this.children.splice(this.children.indexOf(reference), 0, node);
    }
    get nextElementSibling() { const siblings = this.parentElement?.children || []; return siblings[siblings.indexOf(this) + 1] || null; }
  }
  const row = new Element(), wrapper = new Element(), tooltip = new Element(), anchor = new Element(), peer = new Element(), slot = new Element();
  peer.peer = true;
  row.append(wrapper); row.append(peer); wrapper.append(tooltip); tooltip.append(anchor); tooltip.append(slot);
  const window = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/contentScripts/features/topNav.js'), 'utf8'), {
    window, document: { querySelector: selector => selector.includes('prime') ? anchor : null }, HTMLElement: Element, Element
  });
  const Manager = window.TFRTopNav.create({});
  const manager = new Manager({}); manager.slot = slot; manager.isUsableParent = () => true;
  const mount = manager.findMountPoint();
  assert.equal(mount.parent, row); assert.equal(mount.reference, wrapper);
  const first = new Element(), second = new Element(); slot.append(first); slot.append(second);
  manager.ensureButton = () => first; manager.ensureVodsButton = () => second; manager.syncWithAnchor = () => slot;
  manager.injectButton();
  assert.equal(slot.parentElement, row);
  assert.equal(slot.nextElementSibling, wrapper);
  assert.equal(tooltip.contains(slot), false);
  manager.injectButton();
  assert.equal(row.children.filter(child => child === slot).length, 1);
});
