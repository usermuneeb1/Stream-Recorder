#!/usr/bin/env python3
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  🔴 MEGA CSV Format Converter                                              ║
# ║  Converts old CSV format to new format (post May 2024).                    ║
# ║  Based on: github.com/f-o/MEGA-Account-Generator (MIT License)            ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

import os
import csv
import argparse

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

parser = argparse.ArgumentParser(description="Convert old CSV format to new CSV format")
parser.add_argument(
    "-i", "--input",
    default=os.path.join(SCRIPT_DIR, "accounts.csv"),
    type=str,
    help="Input file (default: accounts.csv)"
)
args = parser.parse_args()

if not os.path.exists(args.input):
    print("Input file does not exist.")
    exit(1)

with open(args.input) as csvfile:
    csvreader = csv.reader(csvfile)
    if next(csvreader) == ["Email", "MEGA Password", "Usage", "Mail.tm Password", "Mail.tm ID", "Purpose"]:
        print("CSV file has already been converted.")
        exit(0)
    else:
        print("Converting CSV file...")

# Move file to .old
old_file = args.input + ".old"
os.rename(args.input, old_file)

with open(old_file) as csvfile:
    csvreader_old = csv.reader(csvfile)
    with open(args.input, "a", newline='') as csvfile_new:
        csvwriter_new = csv.writer(csvfile_new)
        csvwriter_new.writerow(["Email", "MEGA Password", "Usage", "Mail.tm Password", "Mail.tm ID", "Purpose"])

        for row in csvreader_old:
            if not row:
                continue
            csvwriter_new.writerow([row[0], row[4].split(":")[1], "-", row[2], row[1], row[5]])

print("✅ CSV converted successfully!")
