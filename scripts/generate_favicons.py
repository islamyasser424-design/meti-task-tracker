import os
from PIL import Image

def generate_favicons():
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    logo_path = os.path.join(root_dir, "logo.jpg")

    if not os.path.exists(logo_path):
        raise FileNotFoundError(f"Logo not found at {logo_path}")

    img = Image.open(logo_path).convert("RGBA")
    
    # Make image square by centering on square canvas or cropping
    w, h = img.size
    min_dim = min(w, h)
    left = (w - min_dim) // 2
    top = (h - min_dim) // 2
    cropped = img.crop((left, top, left + min_dim, top + min_dim))

    # 1. 16x16 PNG
    icon16 = cropped.resize((16, 16), Image.Resampling.LANCZOS)
    icon16_path = os.path.join(root_dir, "favicon-16x16.png")
    icon16.save(icon16_path, format="PNG")
    print(f"Generated {icon16_path}")

    # 2. 32x32 PNG
    icon32 = cropped.resize((32, 32), Image.Resampling.LANCZOS)
    icon32_path = os.path.join(root_dir, "favicon-32x32.png")
    icon32.save(icon32_path, format="PNG")
    print(f"Generated {icon32_path}")

    # 3. 180x180 Apple Touch Icon
    touch = cropped.resize((180, 180), Image.Resampling.LANCZOS)
    touch_path = os.path.join(root_dir, "apple-touch-icon.png")
    touch.save(touch_path, format="PNG")
    print(f"Generated {touch_path}")

    # 4. Multi-resolution favicon.ico (16, 32, 48)
    ico_path = os.path.join(root_dir, "favicon.ico")
    icon48 = cropped.resize((48, 48), Image.Resampling.LANCZOS)
    icon16.save(ico_path, format="ICO", sizes=[(16, 16), (32, 32), (48, 48)])
    print(f"Generated {ico_path}")

if __name__ == "__main__":
    generate_favicons()
