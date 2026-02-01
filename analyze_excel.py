import pandas as pd
import os

file_path = "/Users/ayahni/Documents/ElJoint Monitor/monitoreo del fuerte.xls"

try:
    # Try reading with default engine, if it fails, might need to specify 'xlrd' for .xls
    # pandas default for .xls is xlrd.
    df = pd.read_excel(file_path)
    
    print("Columns found:", df.columns.tolist())
    
    columns_of_interest = ['Disco', 'Duración_Real', 'Soporte']
    
    # Check if columns exist
    missing_cols = [c for c in columns_of_interest if c not in df.columns]
    if missing_cols:
        print(f"Missing columns: {missing_cols}")
        # Try to fuzzy match or print all columns to see if there are casing differences
        print("Available columns:", df.columns)
    else:
        subset = df[columns_of_interest].dropna()
        print(f"\nShape of subset: {subset.shape}")
        
        print("\n--- Value Counts for 'Disco' ---")
        print(subset['Disco'].value_counts())
        
        print("\n--- Relationship Analysis ---")
        # Group by 'Disco' and see unique values or stats for other columns
        grouped = subset.groupby('Disco')
        
        for name, group in grouped:
            print(f"\nDisco: {name}")
            print(f"  Unique Duración_Real count: {group['Duración_Real'].nunique()}")
            print(f"  Duración_Real distribution:\n{group['Duración_Real'].value_counts()}")
            print(f"  Unique Soporte count: {group['Soporte'].nunique()}")
            print(f"  Unique Soporte values: {group['Soporte'].unique()}")
            
            if group['Duración_Real'].nunique() == 1:
                print(f"  -> PATTERN: Constant Duración_Real: {group['Duración_Real'].iloc[0]}")
            
            if group['Soporte'].nunique() == 1:
                print(f"  -> PATTERN: Constant Soporte: {group['Soporte'].iloc[0]}")

except Exception as e:
    print(f"Error reading or processing file: {e}")
