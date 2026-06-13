You are analyzing a photo. Your task has two parts:

1. Classify the image as either "handwriting" (handwritten text, notes, a document) or "blueprint" (a sketch or technical drawing of physical objects — this may be a floor plan/room layout, furniture or cabinet parts, a mechanical part, or any other diagram made of shapes, lines, and dimensions).

2. Process it accordingly:

If "handwriting": Transcribe the text and format it as clean Markdown. Use headings (##) where the writer clearly intended section titles. Use bullet lists (-) for lists. Use plain paragraphs for everything else. Do not add extra structure that isn't implied by the original.

If "blueprint": Extract the drawing's edges and dimension labels as a set of lines. Do not assume the drawing represents a building, rooms, or walls — it could equally be a cabinet, a furniture part, a mechanical component, or any other object. Work systematically:

STEP 1 — ENUMERATE: Scan the sketch left-to-right, top-to-bottom. Count every straight edge in the drawing as its own line segment — a rectangular shape is 4 line segments (one per side), a freestanding edge is 1. Every pen stroke that is part of the drawing must be accounted for by exactly one line — do not merge two distinct edges into one, do not split a single edge into multiple lines, and do not invent edges that are not drawn. If the sketch is drawn on graph/grid paper, the background grid is NOT part of the drawing — never extract it as lines.

STEP 2 — COORDINATES: Return coordinates on a 0-1000 x 0-1000 grid (0,0 is top-left), with each line as a start point (x,y) and end point (x2,y2). Use the sketch as a rough guide for layout — what's above/below/left/right of what, and which edges touch or share a wall — rather than reproducing its hand-drawn proportions exactly: where a written dimension is given, size that edge to match it, and intelligently adjust the rest of the drawing to stay proportional and consistent with the sketch. Edges that share a wall must share identical coordinates on that edge — no gap, no overlap. Edges that are clearly intended to be horizontal or vertical (the vast majority in this kind of sketch) must be reported as exactly horizontal or vertical — snap out any slight skew from hand-drawing rather than reproducing it; only report a non-90-degree angle when the sketch unambiguously shows a deliberate diagonal.

STEP 3 — DIMENSION LABELS: Capture every written measurement (e.g. "12'-6\"", "300mm", "24") as a separate label with its position and its text EXACTLY as written. Place each label's x,y at the point where the text sits in the sketch, adjacent to the edge it measures. Never invent, infer, or add names, titles, or dimensions that are not present in the image.

STEP 4 — CROSS-CHECK: Before answering, compare your coordinates against the written dimensions. If one edge is labeled 20 ft and another 10 ft, the first edge's coordinate span must be about twice the second's. When the sketch's hand-drawn proportions and its written dimension labels conflict, the written dimensions win — adjust your coordinates to agree with them.

Return ONLY a valid JSON object in one of these two shapes — no explanation, no markdown fences:

Handwriting: {"type":"handwriting","markdown":"# Title

Content..."}

Blueprint: {"type":"blueprint","elements":[{"kind":"line","x":0,"y":0,"x2":400,"y2":0},{"kind":"line","x":400,"y":0,"x2":400,"y2":300},{"kind":"line","x":400,"y":300,"x2":0,"y2":300},{"kind":"line","x":0,"y":300,"x2":0,"y":0}],"labels":[{"text":"24 ft","x":200,"y":320,"anchor":"middle"}]}
