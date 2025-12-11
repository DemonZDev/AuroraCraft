# AuroraCraft Design Guidelines

## Design Approach
**Reference-Based: Codella/Kodari Aesthetic**

Drawing from Codella and Kodari's modern development platform design language, AuroraCraft will feature a sophisticated dark-theme interface optimized for prolonged coding sessions with eye-comfort as a priority. The design emphasizes clean code editor integration, smooth transitions, and developer-focused UX patterns.

## Core Design Elements

### Typography
- **Primary Font**: Inter or SF Pro for UI elements (Google Fonts CDN)
- **Code Font**: JetBrains Mono or Fira Code for all code displays (Google Fonts CDN)
- **Hierarchy**: 
  - Hero titles: 48px-56px, bold weight
  - Section headers: 32px-36px, semibold
  - Body text: 15px-16px, regular
  - Code: 14px, monospace
  - Small labels: 13px-14px, medium weight

### Layout System
**Spacing Units**: Tailwind units of 2, 4, 6, 8, 12, 16, 24 (e.g., p-4, gap-8, my-12)
- Consistent padding/margins using this scale
- Component spacing: 4-6 units between related elements
- Section spacing: 12-24 units between major sections

### Component Library

#### Homepage
**Hero Section**: Full-viewport (min-h-screen) centered layout with gradient overlay
- Large hero title centered with generous top spacing (pt-32)
- Prominent chat input box (max-w-4xl, h-16) with rounded corners (rounded-xl)
- Tab selector above input showing Minecraft/Discord/Web (Minecraft highlighted, others greyed/disabled)
- "Start Building" button below input (px-8, py-4, rounded-lg)
- Stats bar below hero showing usage metrics in 3-column grid (grid-cols-3 gap-8)

**Navigation**: Fixed top bar (h-16) with logo left, user menu right
- Transparent background with blur effect when scrolled

#### Authentication Pages
**Centered Card Layout**: Form cards (max-w-md) centered on dark background with subtle gradient
- Input fields: Full-width with border-b style, focus state with accent color
- Password strength indicator: Progress bar below password field
- Form spacing: gap-6 between inputs
- Buttons: Full-width, prominent with rounded corners (rounded-lg)

#### Chat Interface
**Split Layout**: 60% code editor (right) / 40% chat panel (left) on desktop
- Chat panel: Full-height scrollable area with fixed controls at top and bottom
- Message bubbles: User messages right-aligned, AI messages left-aligned with avatar
- Input area: Fixed bottom bar (h-20) with model selector, mode dropdown, enhance button, send button
- Model selector: Dropdown (w-48) showing provider icon + model name
- Stop button: Transforms send button to red circular stop icon when AI running

**Mode Selector**: Segmented control showing Agent/Plan/Question modes
- Active mode highlighted with accent color background

#### Code Editor
**Monaco Integration**: Full-height editor with dark theme matching overall aesthetic
- File tree: Left sidebar (w-64) collapsible, showing folder structure with icons
- Tab bar: Horizontal tabs for open files (h-12) with close buttons
- Action toolbar: Top bar (h-12) with Download ZIP, Compile buttons (right-aligned)
- File context menu: Right-click shows Create/Rename/Delete options

**Compilation Panel**: Bottom drawer (h-48 collapsed, h-96 expanded) showing build logs
- Build history: Horizontal pill indicators (green success, red failure)
- Fix button: Appears on failed builds (warning color, rounded-md)

#### User Dashboard
**Session Grid**: Masonry grid layout (grid-cols-1 md:grid-cols-2 lg:grid-cols-3)
- Session cards: Rounded containers (rounded-xl) with hover elevation
- Card content: Project name (text-lg), last modified, token usage
- Delete icon: Top-right corner, appears on hover

**Token Display**: Prominent top-right display showing current balance
- Token history: Table view with columns for date, action, amount, model used

#### Admin Panel
**Sidebar Navigation**: Left sidebar (w-64) with sections for Overview/Users/Providers/Models
- Content area: Full-width with max-w-7xl container
- Provider cards: Grid layout showing configured providers with edit/delete actions
- Model table: Sortable table with enable/disable toggles, cost per character, visibility checkbox

**Forms**: Two-column layout for provider/model configuration
- Input groups with labels above (text-sm, text-gray-400)
- JSON editor for custom headers: Monaco editor embedded in form

### Visual Elements
**Cards**: Elevated dark cards with subtle border (border-gray-800)
- Padding: p-6 for standard cards, p-8 for feature cards
- Rounded corners: rounded-xl for cards, rounded-lg for buttons

**Buttons**: 
- Primary: Solid accent color with hover brightness increase
- Secondary: Outlined with hover background fill
- Danger: Red color scheme for destructive actions
- Sizes: px-6 py-3 for standard, px-8 py-4 for prominent CTAs

**Inputs**: Dark backgrounds with lighter borders
- Focus state: Accent color border with subtle glow
- Height: h-12 for standard inputs, h-16 for prominent search/chat inputs

**Icons**: Material Icons via CDN
- Consistent 20px-24px sizing
- Used for file types, actions, navigation

### Images
**Hero Section Image**: Abstract gradient visualization of code/AI network (full-width background)
- Overlay: Dark gradient overlay (opacity 60-70%) to ensure text readability
- Placement: Behind hero content, fixed background-attachment for parallax effect

**Feature Illustrations**: None needed - focus on code editor and functional UI

**Avoid**: Stock photos of people, generic tech imagery

### Special Considerations
**Code Syntax Highlighting**: Use Monaco's built-in dark themes (vs-dark or similar)
- Ensure consistent color scheme across all code displays

**Loading States**: Skeleton screens for session loading, pulsing indicators for AI processing
- Live typing animation when AI responds

**Empty States**: Centered illustrations with helpful text for empty session lists, no files in editor

**Responsive Behavior**: 
- Mobile: Stack chat/editor vertically, collapsible file tree drawer
- Tablet: Reduced sidebar widths, maintain split layout
- Desktop: Full split-screen experience

This design creates a cohesive, developer-focused platform that prioritizes functionality while maintaining visual sophistication throughout the extensive feature set.