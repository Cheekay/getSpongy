\# Design System Specification: The Kinetic Pulse  
   
\#\# 1\. Overview & Creative North Star  
\*\*Creative North Star: "The Neon Nocturne"\*\*  
   
This design system moves away from the static, "grid-locked" templates of traditional event platforms. It is inspired by the fluid energy of a dance floor and the atmospheric depth of a darkened club. We treat the interface as a living, breathing canvas where light doesn't just illuminate—it defines space.   
   
By leveraging \*\*intentional asymmetry\*\*, we mimic the rhythmic syncopation of music. Large-scale typography overlaps with high-energy imagery, and components "float" within a multi-layered dark environment. We reject the "flat" web; this system is an editorial exploration of depth, using light leaks and glassmorphism to create a premium, high-octane digital experience.  
   
\---  
   
\#\# 2\. Colors & The "Light as Form" Philosophy  
Our palette is rooted in the deep shadows of the nightlife, punctuated by "Electric Neon" accents that signify action and energy.  
   
\#\#\# Core Palette  
\- \*\*Background (\`\#0e0e13\`):\*\* The absolute base. A "true-dark" with a hint of midnight blue to prevent a washed-out look.  
\- \*\*Primary (\`\#de8eff\`):\*\* Electric Purple. Use for high-energy branding and primary actions.  
\- \*\*Secondary (\`\#00f4fe\`):\*\* Cyan Spark. Use for interaction feedback and secondary focus.  
\- \*\*Tertiary (\`\#bcff5f\`):\*\* Lime Kinetic. Use sparingly for "New" tags, "Live Now" indicators, and high-impact calls to attention.  
   
\#\#\# The "No-Line" Rule  
\*\*Borders are prohibited for sectioning.\*\* We do not use lines to separate content. Boundaries must be defined through:  
1\.  \*\*Background Shifts:\*\* Transitioning from \`surface\` to \`surface-container-low\`.  
2\.  \*\*Tonal Transitions:\*\* Using subtle gradients between \`surface-container\` tiers.  
3\.  \*\*Negative Space:\*\* Embracing the "Spongy" nature of the brand by using large vertical gaps (48px+) to define content blocks.  
   
\#\#\# Surface Hierarchy & Nesting  
Treat the UI as physical layers of smoked glass.   
\- \*\*Base Layer:\*\* \`surface\` (\`\#0e0e13\`).  
\- \*\*Section Layer:\*\* \`surface-container-low\` (\`\#131318\`).  
\- \*\*Card/Interaction Layer:\*\* \`surface-container\` (\`\#19191f\`) or \`surface-container-high\` (\`\#1f1f26\`).  
\- \*\*Active/Hover Layer:\*\* \`surface-bright\` (\`\#2c2b33\`).  
   
\#\#\# The Glass & Gradient Rule  
To achieve "The Neon Nocturne" look, use semi-transparent \`surface-variant\` colors with a \`backdrop-filter: blur(20px)\`. Main CTAs should not be flat; apply a linear gradient from \`primary\` (\`\#de8eff\`) to \`primary-container\` (\`\#d779ff\`) to give buttons a three-dimensional "glow-from-within" quality.  
   
\---  
   
\#\# 3\. Typography: Editorial Impact  
We utilize a high-contrast pairing to balance raw energy with functional clarity.  
   
\*   \*\*Display & Headlines (Space Grotesk):\*\* This is our "Stage Presence." Use \`display-lg\` (3.5rem) with tight letter-spacing (-0.02em) for hero sections. It should feel loud, bold, and slightly technical.  
\*   \*\*Body & Labels (Be Vietnam Pro):\*\* This is our "Navigator." It provides a clean, neutral counter-balance to the loud headers. It ensures that even in a high-energy environment, event details (dates, prices, locations) remain hyper-legible.  
   
\*\*Hierarchy Note:\*\* Use \`headline-lg\` for event titles and \`label-md\` in all-caps for metadata (e.g., "DOORS OPEN AT 9PM") to create an "industrial ticket" aesthetic.  
   
\---  
   
\#\# 4\. Elevation & Depth: Tonal Layering  
Traditional shadows look "muddy" on dark themes. We use \*\*Tonal Layering\*\* and \*\*Ambient Glows\*\* instead.  
   
\- \*\*The Layering Principle:\*\* Place a \`surface-container-lowest\` card on a \`surface-container-low\` section. The slight shift in lightness creates a natural, sophisticated lift.  
\- \*\*Ambient Shadows:\*\* For floating modals, use a shadow with a 40px blur, 0% spread, and an opacity of 8%. The shadow color must be sampled from \`primary\` or \`on-surface\`—never pure black.  
\- \*\*The "Ghost Border" Fallback:\*\* If a container needs more definition (e.g., on hover), use the \`outline-variant\` token at \*\*15% opacity\*\*. This creates a "hairline" edge that feels like a catch-light on glass.  
\- \*\*Dynamic Glows:\*\* Active elements (like a "Now Playing" card) should emit a soft outer glow using the \`primary\` color at 10% opacity, mimicking the spill of a neon sign.  
   
\---  
   
\#\# 5\. Components  
   
\#\#\# Buttons  
\- \*\*Primary:\*\* Gradient from \`primary\` to \`primary-container\`. \`9999px\` (Full) roundedness. Use \`on-primary-fixed\` (Black) for text to ensure maximum punch.  
\- \*\*Secondary:\*\* Transparent background with a "Ghost Border" (\`outline-variant\` at 20%). On hover, fill with \`surface-bright\`.  
\- \*\*Tertiary:\*\* No background. Text color uses \`secondary\`. Subtle \`2px\` underline on hover.  
   
\#\#\# Cards & Lists  
\- \*\*Rule:\*\* Absolute prohibition of divider lines.   
\- \*\*Structure:\*\* Use \`surface-container-low\` for the card background. Group content using vertical padding from the spacing scale.  
\- \*\*Asymmetry:\*\* For event cards, try overlapping the date badge (\`tertiary\`) across the top-left corner of the event image to break the standard container box.  
   
\#\#\# Input Fields  
\- \*\*Base:\*\* \`surface-container-highest\`.   
\- \*\*Focus State:\*\* Transition the "Ghost Border" from 10% to 100% opacity using the \`secondary\` (Cyan) color. Add a \`4px\` soft glow.  
\- \*\*Roundedness:\*\* Use \`sm\` (0.5rem) for inputs to maintain a slightly more "technical" feel compared to the "organic" buttons.  
   
\#\#\# Event Chips (Special Component)  
\- \*\*Status Chips:\*\* Use \`tertiary\_container\` for "Selling Fast" or "Live" states. The high contrast of Lime against the dark background is an immediate visual "hook."  
   
\---  
   
\#\# 6\. Do’s and Don’ts  
   
\#\#\# Do  
\- \*\*Do\*\* use \`display-lg\` typography that overlaps image containers slightly for an editorial look.  
\- \*\*Do\*\* use \`secondary\` (Cyan) for interactive cues like links and toggles.  
\- \*\*Do\*\* embrace "Empty Space." Let the \`background\` (\`\#0e0e13\`) breathe to make the neon accents feel more powerful.  
\- \*\*Do\*\* use the \`xl\` (3rem) roundedness for large image containers to soften the "tech" vibe.  
   
\#\#\# Don’t  
\- \*\*Don't\*\* use 1px solid white or grey borders. They break the "nightlife" immersion.  
\- \*\*Don't\*\* use pure white (\`\#FFFFFF\`) for body text. Use \`on-surface-variant\` (\`\#acaab1\`) for secondary info to maintain hierarchy.  
\- \*\*Don't\*\* stack more than three layers of \`surface-container\` tiers. It becomes visually cluttered.  
\- \*\*Don't\*\* use standard "Drop Shadows." If it doesn't look like light reflecting off a surface, don't use it.  
   
\---  
   
\#\# 7\. Interaction Micro-interactions  
\- \*\*The "Pulse" State:\*\* When a user hovers over a primary CTA, the background gradient should subtly shift or expand, mimicking a heartbeat or a bass kick.  
\- \*\*Parallax Layers:\*\* When scrolling, imagery should move at 0.9x speed relative to the text, creating a sense of three-dimensional depth between the "glass" UI and the "event" content.\`\`\`  
