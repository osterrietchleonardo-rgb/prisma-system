import os

def check_encoding(filepath):
    print(f"Checking {filepath}...")
    try:
        with open(filepath, 'rb') as f:
            content = f.read()
            # Try decoding as UTF-8
            try:
                content.decode('utf-8')
                print("  UTF-8: OK")
            except UnicodeDecodeError as e:
                print(f"  UTF-8: FAIL at {e.start}")
            
            # Check for non-ASCII
            non_ascii = [ (i, b) for i, b in enumerate(content) if b > 127 ]
            if non_ascii:
                print(f"  Found {len(non_ascii)} non-ASCII bytes.")
                # Show some samples
                for i, b in non_ascii[:5]:
                    print(f"    pos {i}: hex {hex(b)}")
            else:
                print("  ASCII-only: YES")
    except Exception as e:
        print(f"  Error: {e}")

files = [
    r"components\whatsapp\ActiveChat.tsx",
    r"components\whatsapp\ConversationsList.tsx",
    r"components\whatsapp\LeadTraceability.tsx"
]

for f in files:
    check_encoding(f)
