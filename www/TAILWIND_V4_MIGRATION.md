# Tailwind CSS v4 Migration Guide

This document outlines the changes made to migrate your tRPC website from Tailwind CSS v3 to v4.

## Changes Made

### 1. Updated CSS Configuration (`www/src/css/custom.css`)

**Before (v3):**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

**After (v4):**

```css
@import 'tailwindcss';

@custom-variant dark (&:where(.dark, .dark *, [data-theme="dark"], [data-theme="dark"] *));

@theme {
  --color-primary-dark: var(--ifm-color-primary-dark);
  --color-primary-darker: var(--ifm-color-primary-darker);
  --color-primary-darkest: var(--ifm-color-primary-darkest);
  --color-primary: var(--ifm-color-primary);
  --color-primary-light: var(--ifm-color-primary-light);
  --color-primary-lighter: var(--ifm-color-primary-lighter);
  --color-primary-lightest: var(--ifm-color-primary-lightest);

  --animate-pop-in: pop-in 1s ease-out;
  --animate-loader: loader 0.6s infinite alternate;
  --animate-infinite-scroll: infinite-scroll 25s linear infinite;
}

@keyframes pop-in {
  /* ... */
}
@keyframes loader {
  /* ... */
}
@keyframes infinite-scroll {
  /* ... */
}
```

### 2. Removed JavaScript Config File (`www/tailwind.config.ts`)

**Before (v3):**

- Separate JavaScript configuration file with theme extensions and dark mode settings
- Required maintenance of both CSS and JS files

**After (v4):**

- **Deleted entirely** - All configuration now lives in CSS
- Dark mode configuration moved to CSS using `@custom-variant` directive
- Theme configuration handled by `@theme` directive

### 3. Dark Mode Configuration

**Before (v3) - JavaScript:**

```typescript
darkMode: ['class', '[data-theme="dark"]']
```

**After (v4) - CSS:**

```css
@custom-variant dark (&:where(.dark, .dark *, [data-theme="dark"], [data-theme="dark"] *));
```

This maintains support for both:

- Class-based dark mode: `<html class="dark">`
- Data attribute dark mode: `<html data-theme="dark">` (Docusaurus default)

### 4. Dependencies

Your `package.json` already has the correct v4 dependencies:

- `tailwindcss: ^4.1.8`
- `@tailwindcss/postcss: ^4.1.8`

### 5. PostCSS Configuration

Your Docusaurus configuration already uses the correct PostCSS plugin (`@tailwindcss/postcss`), so no changes are needed there.

## Key Benefits of v4

1. **Single CSS Configuration**: Everything is now configured in one CSS file
2. **CSS-based Configuration**: Theme values and variants are defined in CSS, making them more accessible
3. **Modern CSS Features**: Uses native CSS features like `@property` and `color-mix()`
4. **Better Performance**: Improved build times and smaller bundle sizes
5. **Enhanced Developer Experience**: Better integration with CSS tooling
6. **Simplified Maintenance**: No need to keep JS and CSS configs in sync

## Browser Support

Tailwind CSS v4 requires modern browsers:

- Safari 16.4+
- Chrome 111+
- Firefox 128+

If you need to support older browsers, consider staying with v3.4 until your browser support requirements change.

## Verification Steps

1. **Build the project**: Run `pnpm build` to ensure everything compiles correctly
2. **Test in browser**: Check that all styles are applied correctly
3. **Check console**: Look for any CSS-related errors in the browser console
4. **Test dark mode**: Verify that dark mode still works properly with Docusaurus theme switching
5. **Verify content detection**: Ensure Tailwind still detects classes from all your source files

## Potential Issues and Solutions

### Issue: CSS Variables Not Available

If you encounter issues with CSS variables not being available in JavaScript, you can access them using:

```javascript
const styles = getComputedStyle(document.documentElement);
const primaryColor = styles.getPropertyValue('--color-primary');
```

### Issue: @apply Not Working in Vue/Svelte Components

If you use CSS modules or component-scoped styles, you may need to add `@reference` to import theme variables:

```css
@reference "../../src/css/custom.css";

.my-component {
  @apply text-primary;
}
```

### Issue: Content Detection

Since there's no JavaScript config file, make sure your CSS file can be discovered by the build system. With Docusaurus, this should work automatically since the CSS file is imported in your layout.

## Rollback Plan

If you encounter issues, you can rollback by:

1. Reverting the changes to `custom.css` (restore `@tailwind` directives, remove `@custom-variant` and `@theme`)
2. Recreating `tailwind.config.ts` with the original configuration
3. Downgrading packages: `pnpm install tailwindcss@^3.4.0`

## Additional Resources

- [Tailwind CSS v4 Upgrade Guide](https://tailwindcss.com/docs/upgrade-guide)
- [Tailwind CSS v4 Dark Mode Documentation](https://tailwindcss.com/docs/dark-mode)
- [CSS @theme Directive](https://tailwindcss.com/docs/adding-custom-styles#using-css-variables)
- [CSS @custom-variant Directive](https://tailwindcss.com/docs/dark-mode#toggling-dark-mode-manually)
