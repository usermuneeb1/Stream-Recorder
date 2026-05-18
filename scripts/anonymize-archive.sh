#!/bin/bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  🔒 Anonymize Old Archive.org Uploads                                      ║
# ║  Updates metadata on ALL existing uploads to remove identifiable info.     ║
# ║  Run once to fix old uploads. New uploads are already anonymous.           ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

set -euo pipefail

ACCESS="${ARCHIVE_ACCESS_KEY:-}"
SECRET="${ARCHIVE_SECRET_KEY:-}"

if [[ -z "$ACCESS" ]] || [[ -z "$SECRET" ]]; then
    echo "❌ ARCHIVE_ACCESS_KEY / ARCHIVE_SECRET_KEY not set"
    exit 1
fi

echo "═══════════════════════════════════════"
echo "🔒 Anonymizing Old Archive.org Uploads"
echo "═══════════════════════════════════════"

# Search for all items uploaded by this account with "tml-" prefix
# (old identifier format before anonymization)
echo "🔍 Searching for old uploads with 'tml-' identifiers..."

SEARCH_URL="https://archive.org/advancedsearch.php?q=identifier%3Atml-*&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=creator&rows=500&output=json"
RESULTS=$(curl -s "$SEARCH_URL" 2>/dev/null || echo '{"response":{"docs":[]}}')
ITEMS=$(echo "$RESULTS" | python3 -c "
import sys, json
data = json.load(sys.stdin)
docs = data.get('response', {}).get('docs', [])
for d in docs:
    print(d.get('identifier', ''))
" 2>/dev/null || true)

if [[ -z "$ITEMS" ]]; then
    echo "✅ No old 'tml-' items found — nothing to anonymize"
    echo ""
    echo "If you know specific identifiers, add them below."
    exit 0
fi

COUNT=$(echo "$ITEMS" | wc -l)
echo "📊 Found $COUNT items to anonymize"
echo ""

SUCCESS=0
FAILED=0

while IFS= read -r identifier; do
    [[ -z "$identifier" ]] && continue
    
    echo "──────────────────────────────────────"
    echo "📦 Updating: $identifier"
    
    # Build JSON patch to replace metadata
    PATCH='[
        {"op": "replace", "path": "/title", "value": "Personal Media Backup"},
        {"op": "replace", "path": "/creator", "value": "Media Archive Bot"},
        {"op": "replace", "path": "/description", "value": "Personal media backup file."},
        {"op": "replace", "path": "/subject", "value": "backup;media;personal;archive"}
    ]'
    
    RESPONSE=$(curl -s \
        --max-time 30 \
        --data-urlencode "target=metadata" \
        --data-urlencode "patch=$PATCH" \
        --data-urlencode "access=$ACCESS" \
        --data-urlencode "secret=$SECRET" \
        "https://archive.org/metadata/$identifier" 2>/dev/null)
    
    if echo "$RESPONSE" | grep -qi "success\|true"; then
        echo "  ✅ Metadata updated"
        SUCCESS=$((SUCCESS + 1))
    else
        echo "  ⚠️ Response: $RESPONSE"
        # Try with "add" instead of "replace" for fields that might not exist
        PATCH_ADD='[
            {"op": "add", "path": "/title", "value": "Personal Media Backup"},
            {"op": "add", "path": "/creator", "value": "Media Archive Bot"},
            {"op": "add", "path": "/description", "value": "Personal media backup file."},
            {"op": "add", "path": "/subject", "value": "backup;media;personal;archive"}
        ]'
        
        RESPONSE2=$(curl -s \
            --max-time 30 \
            --data-urlencode "target=metadata" \
            --data-urlencode "patch=$PATCH_ADD" \
            --data-urlencode "access=$ACCESS" \
            --data-urlencode "secret=$SECRET" \
            "https://archive.org/metadata/$identifier" 2>/dev/null)
        
        if echo "$RESPONSE2" | grep -qi "success\|true"; then
            echo "  ✅ Metadata updated (via add)"
            SUCCESS=$((SUCCESS + 1))
        else
            echo "  ❌ Failed: $RESPONSE2"
            FAILED=$((FAILED + 1))
        fi
    fi
    
    sleep 2  # Rate limit
    
done <<< "$ITEMS"

echo ""
echo "═══════════════════════════════════════"
echo "🔒 Anonymization Complete"
echo "  ✅ Success: $SUCCESS"
echo "  ❌ Failed:  $FAILED"
echo "  📊 Total:   $COUNT"
echo "═══════════════════════════════════════"
