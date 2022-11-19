/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

/* exported init */
const { Atk, Clutter, Gio, GLib, GObject, Meta, Shell, St } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;
const Main = imports.ui.main;
const AltTab = imports.ui.altTab;
const SwitcherPopup = imports.ui.switcherPopup;
const Me = ExtensionUtils.getCurrentExtension();

const overrides = [];
overrides.push([AltTab.AppSwitcher, {
    _init: function _init(_og, apps, altTabPopup) {
        // super._init(true);
        log("called patched AppSwitcher init");
        _og.call(this, apps, altTabPopup);
        const currentMonitorIndex = global.display.get_current_monitor();

        let icons = [...this.icons];
        // Remove windows not on current monitor
        icons.forEach(i => i.cachedWindows = i.cachedWindows.filter(w => 
            w.get_monitor() === currentMonitorIndex
        ));
        // Remove apps with no windows (on current monitor) left
        icons = icons.filter(i => i.cachedWindows.length);

        // (Re-)sort by last interaction
        const lastAppInteract = (icon) => Math.max(...icon.cachedWindows.map(w => w.get_user_time()));
        icons = icons.sort((a, b) => lastAppInteract(b) - lastAppInteract(a));

        // Remove all apps and re-add the ones we're left with
        while (this.icons.length) {
            this._removeIcon(this.icons[0].app);
        }

        for (const icon of icons) {
            let i = new AltTab.AppIcon(icon.app);
            i.cachedWindows = icon.cachedWindows;
            this._addIcon(i);
        }
    },
}]);

overrides.push([AltTab.AppSwitcherPopup, {
    _finish: function _finish(_og, timestamp) {
        log("called patched AppSwitcherPopup _finish");
        let appIcon = this._items[this._selectedIndex];
        let windowIndex = this._currentWindow;
        if (windowIndex < 0) {
            windowIndex = 0;
        }
        
        if (appIcon.cachedWindows[windowIndex]) {
            Main.activateWindow(appIcon.cachedWindows[windowIndex], timestamp);
        }
        Object.getPrototypeOf(Object.getPrototypeOf(this))._finish.call(this, timestamp);
        // super._finish(timestamp);
    },
}]);

overrides.push([SwitcherPopup.SwitcherPopup, {
    vfunc_allocate: function vfunc_allocate(_og, box) {
        this.set_allocation(box);

        let childBox = new Clutter.ActorBox();
        let monitor = Main.layoutManager.currentMonitor;

        let leftPadding = this.get_theme_node().get_padding(St.Side.LEFT);
        let rightPadding = this.get_theme_node().get_padding(St.Side.RIGHT);
        let hPadding = leftPadding + rightPadding;

        // Allocate the switcherList
        // We select a size based on an icon size that does not overflow the screen
        let [, childNaturalHeight] = this._switcherList.get_preferred_height(monitor.width - hPadding);
        let [, childNaturalWidth] = this._switcherList.get_preferred_width(childNaturalHeight);
        childBox.x1 = Math.max(monitor.x + leftPadding, monitor.x + Math.floor((monitor.width - childNaturalWidth) / 2));
        childBox.x2 = Math.min(monitor.x + monitor.width - rightPadding, childBox.x1 + childNaturalWidth);
        childBox.y1 = monitor.y + Math.floor((monitor.height - childNaturalHeight) / 2);
        childBox.y2 = childBox.y1 + childNaturalHeight;
        this._switcherList.allocate(childBox);
    },
}]);

class Extension {
    constructor() {
        log(`initializing ${Me.metadata.name}`);
    }

    enable() {
        log(`enabling ${Me.metadata.name}`);
        for (const [comp, os] of overrides) {
            for (const [prop, o] of Object.entries(os)) {
                log(`patching ${comp.name}.${prop}`);
                o._og = comp.prototype[prop];
                // AltTab[comp].prototype[prop] = o.bind(null, o._og);
                comp.prototype[prop] = function(...args) {
                    o.call(this, o._og, ...args);
                };
            }
        }
    }

    disable() {
        log(`disabling ${Me.metadata.name}`);
        for (const [comp, os] of overrides) {
            for (const [prop, o] of Object.entries(os)) {
                log(`restoring ${comp.name}.${prop}`);
                comp.prototype[prop] = o._og;
            }
        }
    }
}

function init() {
    return new Extension();
}
