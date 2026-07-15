# Layered Penguin Vector Design

## Goal

Recreate the supplied penguin-with-map reference as a clean, editable 2D vector cutout. The result should be easy to recolor, reshape, rearrange, and animate in Inkscape, while remaining suitable for SVG import into Blender.

## Deliverables

- A master SVG containing the complete assembled illustration on a transparent canvas.
- A companion directory containing one SVG for each major movable part.
- A short layer guide identifying the intended stacking order and movable pieces.

## Visual Direction

The illustration will preserve the reference character's recognizable proportions, pose, warm expression, and map-reading concept. Shapes will use rounded contours, clean vector gradients, and restrained highlights rather than attempting to reproduce the source image's fine 3D surface texture.

This is a reconstruction from a single front three-quarter reference. Surfaces hidden by the wings and map will be completed in a plausible simplified form so parts can move without exposing obvious holes. Unseen rear details will remain intentionally minimal.

## Canvas and Compatibility

- Transparent 1600 by 1000 SVG canvas matching the reference's broad landscape composition.
- Standard SVG geometry, gradients, clipping paths, and named groups compatible with current Inkscape releases.
- No linked external images, fonts, or proprietary effects.
- Major pieces will use stable, descriptive IDs to make selection easy in Inkscape's Layers and Objects panel.

## Object Structure

The master artwork will use the following logical stacking order, from back to front:

1. Rear wing and rear body details.
2. Main charcoal body silhouette.
3. Cream belly and face patches.
4. Feet.
5. Eyes, eye highlights, cheeks, and beak.
6. Map base, folds, panels, bookmark, and printed map markings.
7. Front wings and flippers that overlap the map.
8. Small highlights and finishing accents.

Major independently movable pieces will include:

- Body
- Belly and face patch group
- Left and right eyes
- Left and right cheeks
- Upper and lower beak
- Left and right wings
- Left and right feet
- Map
- Bookmark

Decorative details within the face and map will remain grouped with their parent piece unless separating them materially improves editing.

## Editing Behavior

- Each movable piece will be a named top-level group in the master SVG.
- Overlapped pieces will contain enough reconstructed geometry to tolerate modest repositioning.
- The separate-part SVG files will share the same canvas and coordinates, allowing them to be imported and automatically aligned.
- Gradients will remain editable vector fills.
- The map will be editable as a grouped assembly, with its panels and markings available as nested objects.

## Verification

The completed asset will be checked for:

- Valid XML/SVG structure.
- A transparent background and correct view box.
- Presence and uniqueness of all required movable-part IDs.
- No external resource dependencies.
- Correct stacking and alignment in the assembled master file.
- Separate part files that retain the master canvas coordinates.
- A rendered preview that visually resembles the supplied reference at normal viewing size.

## Scope Limits

The deliverable is a 2D vector reconstruction, not a traced copy of every pixel and not a full 3D model. It will not include a skeletal animation rig, lip sync, alternate poses, or detailed artwork for angles absent from the reference.
