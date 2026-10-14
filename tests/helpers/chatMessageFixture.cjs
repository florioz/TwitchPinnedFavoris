// Small DOM fixture for nested Twitch reply contexts (no browser dependency).
module.exports = (Base = class {}) => class ChatNode extends Base {
  constructor(tag = 'div', attrs = {}, text = '', children = []) {
    super(); this.tagName = tag.toUpperCase(); this.attrs = { ...attrs }; this.ownText = text;
    this.nodeType = 1; this.children = children; this.childNodes = children;
    children.forEach(child => { child.parentElement = this; });
    this.dataset = Object.fromEntries(Object.entries(attrs).filter(([key]) => key.startsWith('data-'))
      .map(([key, value]) => [key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase()), value]));
    this.classList = { contains: name => String(this.attrs.class || '').split(' ').includes(name) };
  }
  get textContent() { return this.ownText + this.children.map(child => child.textContent).join(' '); }
  getAttribute(key) { return this.attrs[key] ?? null; }
  removeAttribute(key) { delete this.attrs[key]; }
  matches(selector) {
    return selector.split(',').some(raw => {
      const s = raw.trim();
      if (s.startsWith('.')) return this.classList.contains(s.slice(1));
      const m = s.match(/^([a-z]+)?\[([^=\]]+)(?:="([^"]*)")?\]$/);
      return m ? (!m[1] || m[1].toUpperCase() === this.tagName) && this.attrs[m[2]] !== undefined
        && (m[3] === undefined || this.attrs[m[2]] === m[3]) : s.toUpperCase() === this.tagName;
    });
  }
  querySelectorAll(selector) {
    return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; }
  cloneNode() { return new this.constructor(this.tagName, this.attrs, this.ownText, this.children.map(child => child.cloneNode(true))); }
  remove() { if (this.parentElement) this.parentElement.children.splice(this.parentElement.children.indexOf(this), 1); }
};
