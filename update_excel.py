import pandas as pd
from openpyxl.worksheet.datavalidation import DataValidation
import openpyxl

# Read the tagging categories
df_tags = pd.read_csv('TaggingCategories.csv')
muscles = df_tags['Muscle area'].dropna().unique().tolist()
muscles = sorted([str(m) for m in muscles if str(m).strip() != ''])

# Load the Excel workbook
wb = openpyxl.load_workbook('Exercise Library Index.xlsx')

# Create a data validation object
if 'ValidationList' in wb.sheetnames:
    val_ws = wb['ValidationList']
    val_ws.delete_rows(1, val_ws.max_row) # Clear existing
else:
    val_ws = wb.create_sheet('ValidationList')
    val_ws.sheet_state = 'hidden'

# Write the muscle areas to the hidden sheet
for i, m in enumerate(muscles, start=1):
    val_ws.cell(row=i, column=1, value=m)

# The range for the validation
val_range = f'ValidationList!$A$1:$A${len(muscles)}'

# Create the DataValidation object
dv = DataValidation(type='list', formula1=val_range, allow_blank=True)
dv.error = 'Your entry is not in the list of approved muscle areas.'
dv.errorTitle = 'Invalid Entry'
dv.prompt = 'Please select from the list.'
dv.promptTitle = 'Select Muscle Area'

# Find the "Muscle area" column index dynamically
for sn in wb.sheetnames:
    ws = wb[sn]
    header_row = 1
    muscle_area_col = None
    for col_idx in range(1, ws.max_column + 1):
        if ws.cell(row=header_row, column=col_idx).value == 'Muscle area':
            muscle_area_col = openpyxl.utils.get_column_letter(col_idx)
            break

    if muscle_area_col:
        ws.add_data_validation(dv)
        dv.add(f'{muscle_area_col}2:{muscle_area_col}1048576')
        print(f'Data validation added to {sn} on column {muscle_area_col}')

wb.save('Exercise Library Index.xlsx')
print('Data validation added to Exercise Library Index.xlsx successfully')
