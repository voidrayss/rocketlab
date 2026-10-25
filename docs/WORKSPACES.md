# Shared Part Studio and Assembly

The Assembly, Part Studio, Simulation, and Analysis tabs use the same rocket.
Select a component in Assembly (tree or 3D click), then **Open Part Studio**.
The isolated viewport supports orbit/pan/zoom and perspective/orthographic views.
The same parameter editor is moved between workspaces; no independent editable
part copy is created. Edits commit on Enter/blur and immediately update assembly
geometry and analysis, clear stale flight results, and invalidate affected CAD
exports. Existing CAD controls move with the selected workspace. Solid exports
are available only for supported generators; unsupported types show an error.

Rename parts, hide/show them, duplicate to the library, delete, or export/import
`.rocketpart.json` files. Duplicates/imports start **library only**: they contribute
no mass, length, CP, or drag until **Include in assembly** is checked. Hiding a
part is display only; it remains in engineering. Imported part files have new
identities and baked current dimensions, without dangling external attachments.
Parent deletion retains dependents as library parts rather than deleting them.

Native projects now write rocketlab v3, retaining names, visibility, assembly
membership, relationships, material/dimensions, and imported CAD assets. v1/v2
still load. Stable `uid` identities persist across project reload; numeric runtime
IDs are fresh and attachment IDs are remapped. Individual template import creates
a fresh uid. Legacy unattached parts retain their prior stack behavior.

## Relationships and creation

New noses initialize from the current selected/first assembled body, matching its
outer diameter and attaching at its forward end. New fin cans initialize from the
selected/last body and attach over its aft end. Deleting and recreating them uses
the resized body rather than original defaults. Separate assembled tail fins are
replaced when adding the fin can; stored library definitions are preserved.

The editor supports body end, axial offset, radial manufacturing clearance,
over/inside/butt fin-can fit, and automatic/manual/locked diameter sizing.
Automatic over-body fitting sets sleeve ID to body OD + twice radial clearance;
inside-body fitting sets sleeve OD to body ID − twice clearance. Sleeve wall
thickness is retained. Noses match body OD; rings can match body ID. Body-to-body
butt relationships are also supported. Cycles, missing targets, invalid fit, and
contradictory diameters are rejected atomically, retaining the previous design.
Locked diameter values remain fixed when the body changes; independent lengths
are still editable. Manual overrides are explicit and require fit checks.

The solver provides one position map for rendering and engineering. Attached
sleeves do not add artificial stack length. Distinct body/sleeve material volumes
are counted once each; exposed wetted area excludes the covered tube/sleeve
surface. This is not a general collision detector or detailed step/interference
model. Inside-body fins need physical body slots, which are not cut automatically.
The original attachment-free inline fin-can format remains supported.

## Assembly display

Exploded display separates meshes only. It does not change part dimensions,
attachments, mass, CP/CG, or simulation inputs. Blue CG and red CP rings and
billboard labels use the assembled engineering positions. Their visibility is
controllable; they are hidden in exploded mode to avoid suggesting the separated
meshes form a physical configuration. A numerical readout remains in millimeters
and calibers. Part Studio reports the selected part's local mass and axial CG.

## Verification and remaining scope

`smoke-assembly.mjs` checks resizing, deletion/recreation, clearances and fits,
locked sizing, cycle/invalid-edit rejection, library mass/aerodynamic isolation,
exposed-area accounting, stable identities, relationship remapping, and portable
part files. Chrome tests cover the workspace/editor, projection, library/part
files, 3D selection/markers, recreation, and v3 project reload; offline Part Studio
retains a functional parameter editor with an explicit 3D-unavailable message.

Shoulders, fin overhangs, root fillets, expanded planforms/cross-sections, fin
search, motor catalog expansion and recovery settings are separate milestones.
No unimplemented geometry option is represented as a working solid feature.
