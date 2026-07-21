#!/usr/bin/env python3
"""
PPTX Internal Inspection Script
Unzips PPTX and checks for actual chart/table/image objects in Open XML structure.
"""
import sys
import zipfile
from pathlib import Path

def inspect_pptx(pptx_path):
    """Inspect PPTX internal structure for visual objects."""
    if not Path(pptx_path).exists():
        print(f"❌ File not found: {pptx_path}")
        return False
    
    print(f"\n📊 Inspecting: {pptx_path}")
    print("=" * 70)
    
    try:
        with zipfile.ZipFile(pptx_path, 'r') as zip_ref:
            file_list = zip_ref.namelist()
            
            # Count slides
            slides = [f for f in file_list if f.startswith('ppt/slides/slide') and f.endswith('.xml')]
            print(f"📄 Total slides: {len(slides)}")
            
            # Count charts
            charts = [f for f in file_list if f.startswith('ppt/charts/chart') and f.endswith('.xml')]
            print(f"📈 Chart files: {len(charts)}")
            if charts:
                print(f"   └─ {', '.join([Path(c).name for c in charts])}")
            
            # Count media (images)
            media = [f for f in file_list if f.startswith('ppt/media/')]
            print(f"🖼️  Media files: {len(media)}")
            if media:
                for m in media[:5]:  # Show first 5
                    print(f"   └─ {Path(m).name}")
                if len(media) > 5:
                    print(f"   └─ ... and {len(media) - 5} more")
            
            # Check each slide for visual elements
            print(f"\n📋 Slide-by-slide analysis:")
            for slide_file in sorted(slides):
                slide_num = Path(slide_file).stem.replace('slide', '')
                content = zip_ref.read(slide_file).decode('utf-8', errors='ignore')
                
                has_chart = '<c:chart' in content or 'r:id="rId' in content and 'chart' in content
                has_table = '<a:tbl' in content or '<a:tblPr' in content
                has_image = '<p:pic' in content or '<pic:pic' in content
                
                status = []
                if has_chart:
                    status.append('📈 chart')
                if has_table:
                    status.append('📊 table')
                if has_image:
                    status.append('🖼️  image')
                if not status:
                    status.append('📝 text-only')
                
                print(f"   Slide {slide_num}: {' | '.join(status)}")
            
            # Summary
            print("\n" + "=" * 70)
            total_visuals = len(charts) + len(media)
            if total_visuals > 0:
                print(f"✅ PASS: Found {total_visuals} visual objects ({len(charts)} charts, {len(media)} media)")
                return True
            else:
                print(f"⚠️  WARNING: No visual objects found (charts=0, media=0)")
                return False
                
    except Exception as e:
        print(f"❌ Error inspecting PPTX: {e}")
        return False

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python3 inspect-pptx.py <path-to-pptx>")
        sys.exit(1)
    
    pptx_file = sys.argv[1]
    success = inspect_pptx(pptx_file)
    sys.exit(0 if success else 1)
