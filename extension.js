import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import GdkPixbuf from 'gi://GdkPixbuf';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const PICTURES_DIR =
    GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_PICTURES);

const WALLPAPER_DIR = GLib.build_filenamev([
    PICTURES_DIR,
    'Wallpapers',
]);

const SUPPORTED_EXTENSIONS = [
    '.jpg',
    '.jpeg',
    '.png',
    '.webp',
];

const PAGE_SIZE = 4;
const COLUMNS = 2;
const MAX_POPUP_WIDTH = 396;
const POPUP_PADDING = 16;
const CARD_GAP = 8;

const Indicator = GObject.registerClass(
class Indicator extends PanelMenu.Button {
    _init() {
        super._init(0.0, _('Wallpaper Carousel'));

        this._backgroundSettings = new Gio.Settings({
            schema_id: 'org.gnome.desktop.background',
        });
        this._interfaceSettings = new Gio.Settings({
            schema_id: 'org.gnome.desktop.interface',
        });

        this._page = 0;
        this._tooltip = new St.Label({
            style_class: 'wallpaper-tooltip',
            visible: false,
        });
        Main.uiGroup.add_child(this._tooltip);

        this.add_child(new St.Icon({
            icon_name: 'preferences-desktop-wallpaper-symbolic',
            style_class: 'system-status-icon',
        }));

        this.menu.connect('open-state-changed', (_menu, isOpen) => {
            if (isOpen)
                this._buildMenu();
            else
                this._tooltip.hide();
        });

        this._buildMenu();
    }

    _buildMenu() {
        this._tooltip.hide();
        this.menu.removeAll();

        const wallpapers = this._getWallpapers();
        const pageCount = Math.max(1, Math.ceil(wallpapers.length / PAGE_SIZE));
        if (this._page >= pageCount)
            this._page = pageCount - 1;

        const monitorWidth = Main.layoutManager.primaryMonitor.width;
        const popupWidth = Math.min(MAX_POPUP_WIDTH, monitorWidth - 32);
        const cardWidth = Math.floor((popupWidth - 2 * POPUP_PADDING - CARD_GAP) / COLUMNS);
        const previewWidth = cardWidth - 2;
        const previewHeight = Math.round(previewWidth * 9 / 16);

        const start = this._page * PAGE_SIZE;
        const end = start + PAGE_SIZE;
        const pageWallpapers = wallpapers.slice(start, end);

        const currentWallpaper = this._getCurrentWallpaperPath();

        const gridItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
            style_class: 'wallpaper-picker-menu-item',
        });

        const wrapper = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'wallpaper-picker-wrapper',
            width: popupWidth,
        });

        const header = new St.BoxLayout({
            style_class: 'wallpaper-picker-header',
            x_expand: true,
        });
        const title = new St.Label({
            text: 'Wallpapers',
            style_class: 'wallpaper-picker-title',
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
        });
        const refreshButton = new St.Button({
            child: new St.Icon({icon_name: 'view-refresh-symbolic', icon_size: 16}),
            style_class: 'wallpaper-refresh-button',
            can_focus: true,
            reactive: true,
            track_hover: true,
            accessible_name: 'Обновить список',
        });
        refreshButton.connect('clicked', () => this._buildMenu());
        this._attachTooltip(refreshButton, 'Обновить список');
        header.add_child(title);
        header.add_child(refreshButton);
        wrapper.add_child(header);

        if (wallpapers.length === 0) {
            const emptyLabel = new St.Label({
                text: `Нет изображений в ${WALLPAPER_DIR}`,
                style_class: 'wallpaper-empty-label',
                width: popupWidth - 2 * POPUP_PADDING,
            });
            emptyLabel.clutter_text.line_wrap = true;
            emptyLabel.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
            wrapper.add_child(emptyLabel);
        } else {
            const grid = new St.BoxLayout({
                orientation: Clutter.Orientation.VERTICAL,
                style_class: 'wallpaper-grid',
            });

            for (let rowStart = 0; rowStart < PAGE_SIZE; rowStart += COLUMNS) {
                const row = new St.BoxLayout({
                    orientation: Clutter.Orientation.HORIZONTAL,
                    style_class: 'wallpaper-row',
                });

                for (let column = 0; column < COLUMNS; column++) {
                    const path = pageWallpapers[rowStart + column];
                    row.add_child(path
                        ? this._createWallpaperButton(
                            path, currentWallpaper, cardWidth, previewWidth, previewHeight)
                        : this._createEmptySlot(cardWidth, previewWidth, previewHeight));
                }

                grid.add_child(row);
            }

            wrapper.add_child(grid);
        }

        if (pageCount > 1) {
            const navBox = new St.BoxLayout({
                orientation: Clutter.Orientation.HORIZONTAL,
                x_align: Clutter.ActorAlign.CENTER,
                style_class: 'wallpaper-nav-box',
            });

            const prevButton = this._createNavButton(
                'go-previous-symbolic', 'Предыдущая страница', () => {
                    this._page--;
                    this._buildMenu();
                });
            prevButton.reactive = this._page > 0;
            prevButton.can_focus = prevButton.reactive;

            const pageLabel = new St.Label({
                text: `${this._page + 1} / ${pageCount}`,
                style_class: 'wallpaper-page-label',
                y_align: Clutter.ActorAlign.CENTER,
            });

            const nextButton = this._createNavButton(
                'go-next-symbolic', 'Следующая страница', () => {
                    this._page++;
                    this._buildMenu();
                });
            nextButton.reactive = this._page < pageCount - 1;
            nextButton.can_focus = nextButton.reactive;

            navBox.add_child(prevButton);
            navBox.add_child(pageLabel);
            navBox.add_child(nextButton);
            wrapper.add_child(navBox);
        }

        gridItem.add_child(wrapper);
        this.menu.addMenuItem(gridItem);
    }

    _createPreview(path, width, height) {
        const frame = new St.Widget({
            width,
            height,
            style_class: 'wallpaper-preview-frame',
            clip_to_allocation: true,
            layout_manager: new Clutter.FixedLayout(),
        });

        const placeholder = new St.Icon({
            icon_name: 'image-missing-symbolic',
            icon_size: 20,
            x: Math.round((width - 20) / 2),
            y: Math.round((height - 20) / 2),
        });
        frame.add_child(placeholder);

        try {
            const [, sourceWidth, sourceHeight] = GdkPixbuf.Pixbuf.get_file_info(path);
            if (sourceWidth <= 0 || sourceHeight <= 0)
                return frame;

            const scale = Math.max(width / sourceWidth, height / sourceHeight);
            const imageWidth = Math.ceil(sourceWidth * scale);
            const imageHeight = Math.ceil(sourceHeight * scale);
            const paintScale = St.ThemeContext.get_for_stage(global.stage).get_scale_factor();
            const image = St.TextureCache.get_default().load_file_async(
                Gio.File.new_for_path(path), imageWidth, imageHeight, paintScale, 1);
            image.set_size(imageWidth, imageHeight);
            image.set_content_gravity(Clutter.ContentGravity.RESIZE_ASPECT);
            image.set_position(
                Math.floor((width - imageWidth) / 2),
                Math.floor((height - imageHeight) / 2));
            image.set_content_scaling_filters(
                Clutter.ScalingFilter.LINEAR, Clutter.ScalingFilter.LINEAR);
            frame.add_child(image);
        } catch (error) {
            console.warn(`[Wallpaper Carousel] Preview failed for ${path}: ${error}`);
        }

        return frame;
    }

    _createWallpaperButton(path, currentWallpaper, cardWidth, previewWidth, previewHeight) {
        const filename = GLib.path_get_basename(path);

        const label = new St.Label({
            text: filename,
            style_class: 'wallpaper-preview-label',
            x_align: Clutter.ActorAlign.START,
            width: previewWidth,
        });
        label.clutter_text.single_line_mode = true;
        label.clutter_text.ellipsize = Pango.EllipsizeMode.END;

        const content = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'wallpaper-preview-content',
        });
        content.add_child(this._createPreview(path, previewWidth, previewHeight));
        content.add_child(label);

        const isActive = currentWallpaper === path;

        const button = new St.Button({
            child: content,
            can_focus: true,
            reactive: true,
            track_hover: true,
            width: cardWidth,
            accessible_name: filename,
            style_class: isActive
                ? 'wallpaper-preview-button wallpaper-preview-button-active'
                : 'wallpaper-preview-button',
        });

        button.connect('clicked', () => {
            this._setWallpaper(path);
            this.menu.close();
        });
        this._attachTooltip(button, filename);

        return button;
    }

    _createEmptySlot(cardWidth, previewWidth, previewHeight) {
        const content = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'wallpaper-preview-content',
        });
        content.add_child(new St.Widget({
            width: previewWidth,
            height: previewHeight,
            style_class: 'wallpaper-preview-frame',
        }));
        content.add_child(new St.Label({
            text: ' ',
            style_class: 'wallpaper-preview-label',
            width: previewWidth,
        }));

        return new St.Button({
            child: content,
            width: cardWidth,
            style_class: 'wallpaper-preview-button',
            reactive: false,
            can_focus: false,
            opacity: 0,
        });
    }

    _attachTooltip(button, text) {
        button.connect('notify::hover', () => {
            if (!button.hover) {
                this._tooltip.hide();
                return;
            }

            this._tooltip.text = text;
            this._tooltip.show();
            const [x, y] = button.get_transformed_position();
            const [, tooltipWidth] = this._tooltip.get_preferred_width(-1);
            const [, tooltipHeight] = this._tooltip.get_preferred_height(tooltipWidth);
            this._tooltip.set_position(
                Math.max(8, Math.min(x, global.stage.width - tooltipWidth - 8)),
                y + button.height + tooltipHeight + 8 > global.stage.height
                    ? y - tooltipHeight - 4
                    : y + button.height + 4);
        });
    }

    _createNavButton(iconName, accessibleName, callback) {
        const button = new St.Button({
            child: new St.Icon({icon_name: iconName, icon_size: 14}),
            style_class: 'wallpaper-nav-button',
            can_focus: true,
            reactive: true,
            track_hover: true,
            accessible_name: accessibleName,
        });

        button.connect('clicked', callback);

        return button;
    }

    _getWallpapers() {
        const dir = Gio.File.new_for_path(WALLPAPER_DIR);

        if (!dir.query_exists(null))
            return [];

        const wallpapers = [];
        let enumerator;

        try {
            enumerator = dir.enumerate_children(
                'standard::name,standard::type',
                Gio.FileQueryInfoFlags.NONE,
                null
            );
        } catch (error) {
            console.error(
                `[Wallpaper Carousel] Failed to read directory: ${error}`
            );
            return [];
        }

        let info;

        while ((info = enumerator.next_file(null)) !== null) {
            if (info.get_file_type() !== Gio.FileType.REGULAR)
                continue;

            const filename = info.get_name();
            const lower = filename.toLowerCase();

            if (!SUPPORTED_EXTENSIONS.some(ext => lower.endsWith(ext)))
                continue;

            wallpapers.push(
                GLib.build_filenamev([
                    WALLPAPER_DIR,
                    filename,
                ])
            );
        }

        enumerator.close(null);
        wallpapers.sort();

        return wallpapers;
    }

    _getCurrentWallpaperPath() {
        const key = this._interfaceSettings.get_string('color-scheme') === 'prefer-dark'
            ? 'picture-uri-dark'
            : 'picture-uri';
        const uri = this._backgroundSettings.get_string(key);

        if (!uri || !uri.startsWith('file://'))
            return null;

        try {
            return Gio.File.new_for_uri(uri).get_path();
        } catch (_error) {
            return null;
        }
    }

    _setWallpaper(path) {
        const uri = Gio.File.new_for_path(path).get_uri();

        this._backgroundSettings.set_string('picture-uri', uri);
        this._backgroundSettings.set_string('picture-uri-dark', uri);

        Main.notify(
            'Wallpaper Carousel',
            GLib.path_get_basename(path)
        );
    }

    destroy() {
        super.destroy();
        this._tooltip.destroy();
    }
});

export default class WallpaperCarouselExtension extends Extension {
    enable() {
        this._indicator = new Indicator();
        Main.panel.addToStatusArea(this.uuid, this._indicator);
    }

    disable() {
        this._indicator.destroy();
        this._indicator = null;
    }
}
