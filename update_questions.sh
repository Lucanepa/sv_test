#!/bin/bash
# Updates metadata.json with the current date.
# Run this after updating question JSON files.
#
# Usage:
#   ./update_questions.sh          # keeps current testYear
#   ./update_questions.sh 2026     # sets testYear to 2026

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
META="$SCRIPT_DIR/metadata.json"

TODAY=$(date +%d.%m.%y)

if [ -n "$1" ]; then
    YEAR="$1"
else
    YEAR=$(grep -o '"testYear": *[0-9]*' "$META" | grep -o '[0-9]*')
fi

cat > "$META" <<EOF
{
  "testYear": $YEAR,
  "lastUpdated": "$TODAY"
}
EOF

echo "Updated metadata.json: testYear=$YEAR, lastUpdated=$TODAY"
