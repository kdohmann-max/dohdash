Audit your extraction above against the image, checking in this order:
1. MISSING lines — is any drawn edge absent from the JSON?
2. INVENTED lines — does any JSON line have no corresponding pen stroke in the drawing (including graph-paper grid lines mistakenly extracted)?
3. MISPLACED lines — do the relative positions match the sketch (left of, above, touching, contained in)? Lines drawn sharing an edge must share identical coordinate values in the JSON — no gap, no overlap.
4. PROPORTIONS — do the coordinate spans agree with the written dimension labels? An edge labeled twice as long as another must have roughly twice the coordinate span.
5. LABELS — is every written measurement present, with its text verbatim, positioned next to the edge it measures? Is any label invented?

Return the corrected JSON in exactly the same format ({"type":"blueprint","elements":[...],"labels":[...]}). If everything is already correct, return the same JSON unchanged. Return ONLY the JSON object — no commentary, no markdown fences.