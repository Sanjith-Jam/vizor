# AR Optical Combiner Subsystem

The AR display subsystem uses a birdbath / beamsplitter architecture designed to fit within the brow and visor recess of a full-face or modular helmet.

---

## 📐 Optical Principles

```text
       [SSD1306 OLED Display] (Downward-facing emissive image)
                 │
                 ▼ (Image light rays)
         /----------------/  (45° Semi-reflective optical combiner)
        /                /
       /                /
      /                /  ===> Virtual floating image focused in rider's eyeline
     ------------------

     ======================> Forward road view (Unobstructed pass-through)
```

1. **Micro-OLED Display:** The SSD1306 (128x64 px) provides high-contrast monochrome pixels. Because unlit pixels emit zero light, the black background appears completely transparent to the eye.
2. **Combiner Plate:** A semi-reflective plate (30% reflectance, 70% transmittance or 50/50) placed at a 45-degree angle reflects the OLED display down into the rider's upper field of vision.
3. **Collimation Lens (Optional):** A small plano-convex lens positioned between the display and combiner plate pushes the focal plane out towards optical infinity (2–3 meters ahead), minimizing eye accommodation fatigue.

---

## ☀️ Ambient Contrast & Auto-Brightness

- **Direct Sunlight:** Sunlight produces ambient illuminance up to 100,000 lux. The BH1750 ambient light sensor drives the OLED contrast register dynamically to max brightness.
- **Night Riding:** Low ambient levels (< 10 lux) cause the firmware to scale back display brightness to prevent blinding the rider and preserving night vision.
