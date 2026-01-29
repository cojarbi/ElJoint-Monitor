import os
from dotenv import load_dotenv
from google import genai

load_dotenv()

client = genai.Client(api_key=os.environ.get("GOOGLE_API_KEY"))

print("Searching for Gemini 3 models...")
try:
    models = client.models.list()
    found = False
    for m in models:
        if "gemini-3" in m.name or "flash" in m.name:
            print(f"FOUND: {m.name}")
            if "gemini-3" in m.name:
                found = True
    
    if not found:
        print("No 'gemini-3' models found in the list.")
            
except Exception as e:
    print(f"Error listing models: {e}")
