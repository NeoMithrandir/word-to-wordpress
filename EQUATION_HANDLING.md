# Equation and Formula Handling

The Word to WordPress converter now includes comprehensive support for mathematical equations and formulas. This document explains how equations are processed and rendered.

## Features

### ✅ Supported Equation Types

1. **Display Equations** - Block-level equations that appear on their own line
2. **Inline Equations** - Equations that appear within text
3. **Numbered Equations** - Equations with automatic numbering
4. **Office Math (OMath)** - Microsoft Word's built-in equation editor

### ✅ Mathematical Symbols Supported

- **Basic Operations**: ×, ÷, ±, ∞
- **Comparisons**: ≤, ≥, ≠, ≈
- **Greek Letters**: α, β, γ, δ, ε, θ, λ, μ, π, σ, φ, ψ, ω
- **Arrows**: →, ←, ↔, ⇒, ⇐, ⇔
- **Set Theory**: ∈, ∉, ⊂, ⊃, ∪, ∩, ∅
- **Number Sets**: ℕ, ℤ, ℚ, ℝ, ℂ
- **Functions**: sin, cos, tan, log, ln, exp, lim
- **Calculus**: ∑, ∏, ∫, ∂, √

### ✅ LaTeX Conversion

The converter automatically converts mathematical notation to LaTeX format:

| Original | LaTeX Output |
|----------|--------------|
| `1/2` | `\frac{1}{2}` |
| `x²` | `x^2` |
| `√(x)` | `\sqrt{x}` |
| `α + β` | `\alpha + \beta` |
| `x ≤ y` | `x \leq y` |
| `sin(θ)` | `\sin(\theta)` |

## How It Works

### 1. Document Processing

When a Word document is uploaded, the converter:

1. **Detects Equations**: Identifies equation elements using mammoth.js style mappings
2. **Extracts Content**: Pulls out the mathematical text and structure
3. **Converts to LaTeX**: Transforms mathematical notation to LaTeX format
4. **Preserves Structure**: Maintains display vs inline formatting

### 2. Style Mappings

The converter recognizes these Word equation styles:

```javascript
// Display equations
"p[style-name='Equation'] => div.equation-display:fresh"
"p[style-name='Display Math'] => div.math-display:fresh"

// Inline equations  
"p[style-name='Inline Equation'] => span.equation-inline:fresh"
"p[style-name='Math'] => span.math-inline:fresh"

// Office Math elements
"oMath => span.math-inline"
"oMathPara => div.math-display"
```

### 3. LaTeX Conversion

The `convertToLatex()` method handles:

- **Symbol Mapping**: Converts Unicode symbols to LaTeX commands
- **Fraction Detection**: Converts `a/b` to `\frac{a}{b}`
- **Subscript/Superscript**: Converts `x_2` and `x^2` notation
- **Function Recognition**: Identifies and formats mathematical functions
- **Square Roots**: Converts `√(x)` to `\sqrt{x}`

### 4. WordPress Integration

When publishing to WordPress:

1. **MathJax Integration**: Automatically includes MathJax for equation rendering
2. **CSS Styling**: Adds equation-specific styles for proper display
3. **Reference Section**: Creates an equations reference list
4. **Responsive Design**: Ensures equations work on all devices

## Preview Interface

The preview interface includes a dedicated **Equations** tab that shows:

- **Equation Type**: Display or inline
- **LaTeX Code**: The converted LaTeX representation
- **Live Preview**: Rendered equation using MathJax
- **Equation Numbers**: If present in the original document

## WordPress Rendering

### MathJax Configuration

The converter automatically adds MathJax to WordPress posts:

```html
<script type="text/javascript" async
  src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>
<script type="text/javascript">
  window.MathJax = {
    tex: {
      inlineMath: [['$', '$'], ['\\(', '\\)']],
      displayMath: [['$$', '$$'], ['\\[', '\\]']],
      processEscapes: true,
      processEnvironments: true
    }
  };
</script>
```

### CSS Styling

Equation-specific CSS ensures proper display:

```css
.equation-display, .math-display {
  text-align: center;
  margin: 1em 0;
  padding: 1em;
  background-color: #f8f9fa;
  border-radius: 4px;
  overflow-x: auto;
}

.equation-inline, .math-inline {
  font-style: italic;
}
```

## Testing

### Test Equations

Run the test script to see supported equation types:

```bash
node test-equations.js
```

### Sample Word Document

Create a Word document with:

1. **Simple Equations**: `2 + 2 = 4`
2. **Fractions**: `1/2 + 3/4`
3. **Greek Letters**: `α + β = γ`
4. **Square Roots**: `√(x² + y²)`
5. **Functions**: `sin(θ) + cos(θ)`

### Verification Steps

1. Upload the document to the converter
2. Check the **Equations** tab in the preview
3. Verify LaTeX conversion is correct
4. Publish to WordPress and check rendering

## Troubleshooting

### Common Issues

1. **Equations Not Detected**
   - Ensure equations use Word's equation editor
   - Check that equations have proper style names
   - Try converting equations to text format

2. **LaTeX Conversion Issues**
   - Some complex equations may need manual adjustment
   - Check the equations tab for conversion results
   - Edit LaTeX code manually if needed

3. **Rendering Problems**
   - Ensure MathJax is loading properly
   - Check browser console for JavaScript errors
   - Verify CSS is not being overridden

### Debug Information

The converter provides detailed logging:

- Equation detection in console
- LaTeX conversion results
- MathJax loading status
- WordPress integration details

## Future Enhancements

Planned improvements:

- **Better OMath Support**: Enhanced Office Math parsing
- **Equation Numbering**: Automatic equation numbering
- **Cross-References**: Links between equations and text
- **Custom LaTeX**: User-defined LaTeX templates
- **Export Options**: Export equations as images

## Support

For issues with equation handling:

1. Check the console logs for error messages
2. Verify Word document equation formatting
3. Test with simple equations first
4. Review the equations tab in preview
5. Check WordPress MathJax integration 