# Adding Visualization 04 to the CARE PARROTS site

Visualization 04 is a self-contained D3 component: a world choropleth, a detail panel and a ranking chart. All of its CSS is scoped to `#parrot-conservation-viz`, so it can't restyle the navigation, typography or the other visualizations.

## 1. Copy four files into the site repo

| From this repo | To the site repo |
|---|---|
| `visualizations/visualization4.js`  | `visualizations/visualization4.js` |
| `visualizations/visualization4.css` | `visualizations/visualization4.css` |
| `data/parrots.json`                 | `data/parrots.json` |
| `data/realms.geojson`               | `data/realms.geojson` |

None of these names exist on the site yet, so nothing gets overwritten.

## 2. Load the stylesheet

In `index.html`, add this inside `<head>`, after `style.css`:

```html
<link rel="stylesheet" href="visualizations/visualization4.css">
```

D3 v7 is already loaded in `<head>`, so no other library is needed.

## 3. Replace the Data Visualization 04 placeholder

Find the `<!-- Visualization 4 -->` card and replace the whole `visualization-container` block with:

```html
<!-- Visualization 4 -->
<div class="visualization-container">
    <div class="visualization-header">
        <div>
            <span class="visualization-label">DATA VISUALIZATION 04</span>
            <h3>Where Are Parrots Most at Risk?</h3>
        </div>
        <span class="coming-soon">CHOROPLETH MAP</span>
    </div>

    <div id="parrot-conservation-viz" data-path="data/"></div>
</div>

<script src="visualizations/visualization4.js" defer></script>
```

That's it. The script finds `#parrot-conservation-viz` and starts itself.

## Notes

- **Keep the id.** All the CSS hangs off `id="parrot-conservation-viz"`. If you leave `class="visualization-placeholder"` on the div, the component cancels its dashed border and padding, so that's harmless too.
- **Data location.** `data-path` is the folder that holds both data files, relative to `index.html`. It defaults to `data/`.
- **Manual start (optional).** Instead of relying on auto-start, you can call `ParrotConservationViz.init("#parrot-conservation-viz", { dataPath: "data/" })`. It returns `{ destroy() }`.
- **Sizing.** The component fills the card's width and grows as tall as it needs. It redraws on its own when the card resizes. At card widths under 760px the detail panel moves below the map.
- **Testing locally.** Run it from a local server (for example `python -m http.server`), not `file://`, because browsers block `d3.json` on `file://` pages.
- **Preview.** The `index.html` in this repo is a local preview that copies the site's card styles. It doesn't need to be copied over.
