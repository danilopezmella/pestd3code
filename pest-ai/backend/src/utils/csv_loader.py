import csv

def load_keywords(csv_file: str):
    """Loads keywords from a CSV file and returns them as a list."""
    keywords = []
    with open(csv_file, mode="r", encoding="utf-8-sig") as file:  # Use utf-8-sig to remove BOM
        reader = csv.DictReader(file)

        # Debugging: Print the detected column names
        print("Detected CSV Headers:", reader.fieldnames)

        for row in reader:
            keywords.append(row["keyword"].strip().lower())  # Store in lowercase

    return keywords
