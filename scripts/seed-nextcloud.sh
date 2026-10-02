#!/usr/bin/env bash
#
# Seed a Nextcloud instance with calendars and events over CalDAV.
#
#   NC_URL=https://cloud.example.com NC_USER=admin NC_PASS=secret ./seed-nextcloud.sh
#
# Options:
#   -n, --dry-run          print what would be sent, do not touch the server
#   -w, --weeks N          number of weeks to fill (default 4)
#   -c, --calendars N      number of calendars to create (default 15, max 15)
#   -e, --email ADDR       ORGANIZER address (default $NC_USER@example.org)
#   -s, --seed N           RNG seed for reproducible data (default 42)
#       --wipe             delete the seeded calendars instead of creating them
set -uo pipefail

NC_URL="${NC_URL:-}"
NC_USER="${NC_USER:-admin}"
NC_PASS="${NC_PASS:-}"
NC_URL="${NC_URL%/}"

WEEKS=4
NCAL=15
DRY_RUN=0
WIPE=0
SEED=42
EMAIL=""
TZID="Europe/Paris"

while [[ $# -gt 0 ]]; do
  case "$1" in
    -n|--dry-run)   DRY_RUN=1; shift ;;
    -w|--weeks)     WEEKS="$2"; shift 2 ;;
    -c|--calendars) NCAL="$2"; shift 2 ;;
    -e|--email)     EMAIL="$2"; shift 2 ;;
    -s|--seed)      SEED="$2"; shift 2 ;;
    --wipe)         WIPE=1; shift ;;
    -h|--help)      sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

EMAIL="${EMAIL:-${NC_USER}@example.org}"
DAV="$NC_URL/remote.php/dav/calendars/$NC_USER"

if [[ -z "$NC_PASS" && $DRY_RUN -eq 0 && -z "${NC_SEED_LIB:-}" ]]; then
  echo "NC_PASS is empty. Export it (an app password is preferred over the account password)." >&2
  exit 1
fi

RANDOM=$SEED

CALENDARS=(
  "perso|Personnel|#0082C9"
  "boulot|Travail|#E9322D"
  "famille|Famille|#46BA61"
  "sport|Sport|#F1DB50"
  "sante|Santé|#B8308A"
  "voyages|Voyages|#FF7A00"
  "projets|Projets|#7C4DFF"
  "astreintes|Astreintes|#795548"
  "formations|Formations|#009688"
  "anniversaires|Anniversaires|#FF4081"
  "factures|Factures et échéances|#607D8B"
  "assos|Associatif|#8BC34A"
  "enfants|Enfants|#03A9F4"
  "maison|Maison et travaux|#9E9E9E"
  "divers|Divers|#3F51B5"
)

declare -A SUMMARIES=(
  [perso]="Courses;Coiffeur;Café avec Léa;Lecture;Ménage;Appel maman"
  [boulot]="Daily standup;Revue de sprint;1:1 manager;Point client;Rétro;Atelier archi;Entretien candidat;Comité produit"
  [famille]="Dîner famille;Visite grands-parents;Sortie parc;Brunch;Conseil de classe"
  [sport]="Course à pied;Salle de sport;Natation;Vélo;Yoga;Escalade"
  [sante]="Dentiste;Kiné;Médecin traitant;Ophtalmo;Prise de sang"
  [voyages]="Vol Paris-Lisbonne;Train Lyon-Paris;Check-in hôtel;Location voiture"
  [projets]="Refonte app mobile;Sync design;Point roadmap;Démo interne;Grooming backlog"
  [astreintes]="Astreinte niveau 1;Astreinte niveau 2;Passation astreinte"
  [formations]="Formation Kubernetes;MOOC React Native;Certification AWS;Atelier accessibilité"
  [anniversaires]="Anniversaire Camille;Anniversaire Théo;Anniversaire Nina;Anniversaire Papa"
  [factures]="Échéance loyer;Prélèvement EDF;Facture internet;Impôts;Assurance auto"
  [assos]="Réunion bureau;Permanence;Assemblée générale;Distribution"
  [enfants]="Sortie scolaire;Cours de piano;Judo;Réunion parents-profs;Goûter d'anniversaire"
  [maison]="Plombier;Livraison meuble;Jardinage;Nettoyage garage;Visite syndic"
  [divers]="Rendez-vous banque;Préfecture;La Poste;Bibliothèque"
)

declare -A LOCATIONS=(
  [perso]="Maison;Centre-ville;Café Nomad"
  [boulot]="Salle Everest;Visio;Open space;Salle K2"
  [famille]="Maison;Chez Papi;Parc de la Tête d'Or"
  [sport]="Parc;Basic Fit;Piscine municipale;Block'Out"
  [sante]="Cabinet Dr. Morel;Laboratoire Cerba;Clinique du Parc"
  [voyages]="CDG T2;Gare Part-Dieu;Hôtel Ibis"
  [projets]="Visio;Salle Alpha"
  [astreintes]="Remote"
  [formations]="Visio;Campus Numérique"
  [anniversaires]=""
  [factures]=""
  [assos]="Local associatif;Mairie annexe"
  [enfants]="École Jean Moulin;Conservatoire;Dojo"
  [maison]="Maison;Cave;Jardin"
  [divers]="Agence Crédit Agricole;Préfecture;Bureau de poste"
)

declare -A DURATIONS=(
  [perso]="30;45;60;90"
  [boulot]="15;30;45;60;90"
  [famille]="60;120;180"
  [sport]="45;60;75;90"
  [sante]="20;30;45"
  [voyages]="60;120;240"
  [projets]="30;45;60"
  [astreintes]="60;120"
  [formations]="90;120;180"
  [anniversaires]="60"
  [factures]="60"
  [assos]="60;90;120"
  [enfants]="45;60;90"
  [maison]="60;90;120;180"
  [divers]="30;45;60"
)

ATTENDEES=(
  "Camille Roy|camille.roy@example.org"
  "Nina Aubert|nina.aubert@example.org"
  "Marc Diallo|marc.diallo@example.org"
  "Sofia Bianchi|sofia.bianchi@example.org"
)

STATUSES=(CONFIRMED CONFIRMED CONFIRMED CONFIRMED CONFIRMED CONFIRMED CONFIRMED CONFIRMED TENTATIVE CANCELLED)
HOURS=(8 9 10 11 13 14 15 16 17 18 19 20)
MINUTES=(0 0 15 30 45)

pick() {
  local IFS=';' ; read -ra arr <<< "$1"
  (( ${#arr[@]} == 0 )) && return 0
  echo "${arr[$((RANDOM % ${#arr[@]}))]}"
}

rand_between() { echo $(( $1 + RANDOM % ($2 - $1 + 1) )); }

esc() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/;/\\;/g' -e 's/,/\\,/g'
}

LAST_BODY=""
dav_request() {
  local method="$1" url="$2" body="${3:-}" ctype="${4:-application/xml; charset=utf-8}"
  local attempt=0 max=6 delay=15 code tmp
  tmp="$(mktemp)"
  while :; do
    if [[ -n "$body" ]]; then
      code=$(printf '%s' "$body" | curl -sS -o "$tmp" -w '%{http_code}' \
        -u "$NC_USER:$NC_PASS" -X "$method" \
        -H "Content-Type: $ctype" --data-binary @- "$url")
    else
      code=$(curl -sS -o "$tmp" -w '%{http_code}' \
        -u "$NC_USER:$NC_PASS" -X "$method" "$url")
    fi
    if [[ "$code" == "429" && $attempt -lt $max ]]; then
      attempt=$((attempt + 1))
      echo "    throttled (429), retry $attempt/$max in ${delay}s" >&2
      sleep "$delay"
      delay=$((delay * 2))
      continue
    fi
    break
  done
  LAST_BODY="$(cat "$tmp")"
  rm -f "$tmp"
  printf '%s' "$code"
}

VTIMEZONE='BEGIN:VTIMEZONE
TZID:Europe/Paris
BEGIN:DAYLIGHT
TZOFFSETFROM:+0100
TZOFFSETTO:+0200
TZNAME:CEST
DTSTART:19700329T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:+0200
TZOFFSETTO:+0100
TZNAME:CET
DTSTART:19701025T030000
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU
END:STANDARD
END:VTIMEZONE'

build_ics() {
  local uid="$1" summary="$2" dtstart="$3" dtend="$4" allday="$5"
  local location="$6" description="$7" rrule="$8" status="$9" nattendees="${10}"
  local stamp; stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  local out=""

  out+="BEGIN:VCALENDAR"$'\n'
  out+="VERSION:2.0"$'\n'
  out+="PRODID:-//nc-seed//FR"$'\n'
  out+="CALSCALE:GREGORIAN"$'\n'
  [[ "$allday" == "0" ]] && out+="$VTIMEZONE"$'\n'
  out+="BEGIN:VEVENT"$'\n'
  out+="UID:$uid"$'\n'
  out+="DTSTAMP:$stamp"$'\n'

  if [[ "$allday" == "1" ]]; then
    out+="DTSTART;VALUE=DATE:$dtstart"$'\n'
    out+="DTEND;VALUE=DATE:$dtend"$'\n'
  else
    out+="DTSTART;TZID=$TZID:$dtstart"$'\n'
    out+="DTEND;TZID=$TZID:$dtend"$'\n'
  fi

  out+="SUMMARY:$(esc "$summary")"$'\n'
  [[ -n "$location" ]]    && out+="LOCATION:$(esc "$location")"$'\n'
  [[ -n "$description" ]] && out+="DESCRIPTION:$(esc "$description")"$'\n'
  [[ -n "$rrule" ]]       && out+="RRULE:$rrule"$'\n'

  if (( nattendees > 0 )); then
    out+="ORGANIZER;CN=$NC_USER:mailto:$EMAIL"$'\n'

    local i cn mail
    for (( i = 0; i < nattendees; i++ )); do
      IFS='|' read -r cn mail <<< "${ATTENDEES[$(( (RANDOM + i) % ${#ATTENDEES[@]} ))]}"
      out+="ATTENDEE;CN=$cn;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:$mail"$'\n'
    done
  fi

  out+="STATUS:$status"$'\n'
  out+="END:VEVENT"$'\n'
  out+="END:VCALENDAR"$'\n'

  printf '%s' "$out" | sed 's/$/\r/'
}

put_event() {
  local slug="$1" uid="$2" ics="$3" code
  if [[ $DRY_RUN -eq 1 ]]; then
    return 0
  fi
  code=$(dav_request PUT "$DAV/$slug/$uid.ics" "$ics" "text/calendar; charset=utf-8")
  if [[ "$code" != "201" && "$code" != "204" ]]; then
    FAILURES+=("PUT $slug/$uid -> $code ${LAST_BODY:0:160}")
    return 1
  fi
  return 0
}

make_calendar() {
  local slug="$1" name="$2" color="$3" code body
  body="<?xml version=\"1.0\" encoding=\"utf-8\" ?>
<C:mkcalendar xmlns:D=\"DAV:\" xmlns:C=\"urn:ietf:params:xml:ns:caldav\"
              xmlns:A=\"http://apple.com/ns/ical/\">
  <D:set>
    <D:prop>
      <D:displayname>$name</D:displayname>
      <A:calendar-color>$color</A:calendar-color>
      <C:supported-calendar-component-set>
        <C:comp name=\"VEVENT\"/>
      </C:supported-calendar-component-set>
    </D:prop>
  </D:set>
</C:mkcalendar>"
  code=$(dav_request MKCALENDAR "$DAV/$slug/" "$body")
  printf '%s' "$code"
}

[[ -n "${NC_SEED_LIB:-}" ]] && return 0

TODAY_DOW="$(date +%u 2>/dev/null)" || { echo "GNU date required (date -d)." >&2; exit 1; }
WEEK_START="$(date -d "-$((TODAY_DOW - 1)) days" +%Y-%m-%d)" || {
  echo "GNU date required (date -d)." >&2; exit 1; }
TOTAL_DAYS=$((WEEKS * 7))
WEEK_END="$(date -d "$WEEK_START +$((TOTAL_DAYS - 1)) days" +%Y-%m-%d)"

declare -a FAILURES=()
TOTAL=0

if [[ $WIPE -eq 1 ]]; then
  echo "Deleting seeded calendars on $DAV"
  for entry in "${CALENDARS[@]:0:$NCAL}"; do
    IFS='|' read -r slug _ _ <<< "$entry"
    if [[ $DRY_RUN -eq 1 ]]; then
      echo "  [dry] DELETE $slug"
    else
      code=$(dav_request DELETE "$DAV/$slug/")
      echo "  - $slug -> $code"
    fi
  done
  exit 0
fi

echo "Target : $DAV"
echo "Window : $WEEK_START -> $WEEK_END ($WEEKS weeks)"
echo "Cals   : $NCAL"
[[ $DRY_RUN -eq 1 ]] && echo "Mode   : DRY RUN"
echo

for entry in "${CALENDARS[@]:0:$NCAL}"; do
  IFS='|' read -r slug name color <<< "$entry"

  if [[ $DRY_RUN -eq 1 ]]; then
    echo "  [dry] MKCALENDAR $slug ($name, $color)"
  else
    code=$(make_calendar "$slug" "$name" "$color")
    case "$code" in
      201) echo "  + calendar $slug -> created" ;;
      405) echo "  = calendar $slug -> exists" ;;
      *)   FAILURES+=("MKCALENDAR $slug -> $code ${LAST_BODY:0:160}")
           echo "  ! calendar $slug -> $code (skipped)"
           continue ;;
    esac
  fi

  n=0
  count_cal=0

  for (( d = 0; d < TOTAL_DAYS; d++ )); do
    day="$(date -d "$WEEK_START +$d days" +%Y-%m-%d)"
    daystamp="$(date -d "$day" +%Y%m%d)"
    dow="$(date -d "$day" +%u)"

    case "$slug" in
      boulot)
        if (( dow >= 6 )); then count=0; else count=$(rand_between 3 6); fi ;;
      anniversaires|factures)
        if (( RANDOM % 4 == 0 )); then count=1; else count=0; fi ;;
      astreintes)
        if (( dow == 1 || dow == 4 )); then count=1; else count=0; fi ;;
      *)
        count=$(rand_between 0 2) ;;
    esac

    for (( k = 0; k < count; k++ )); do
      n=$((n + 1))
      uid="seed-$slug-$daystamp-$n"
      summary="$(pick "${SUMMARIES[$slug]}")"

      if [[ "$slug" == "anniversaires" || "$slug" == "factures" ]]; then
        dtend="$(date -d "$day +1 day" +%Y%m%d)"
        ics="$(build_ics "$uid" "$summary" "$daystamp" "$dtend" 1 \
              "" "Événement généré pour le jeu de test." "" "CONFIRMED" 0)"
      else
        hour="${HOURS[$((RANDOM % ${#HOURS[@]}))]}"
        minute="${MINUTES[$((RANDOM % ${#MINUTES[@]}))]}"
        dur="$(pick "${DURATIONS[$slug]}")"
        start_hm="$(printf '%02d%02d00' "$hour" "$minute")"
        end="$(date -d "$day $hour:$minute $dur minutes" +%Y%m%dT%H%M%S)"
        status="${STATUSES[$((RANDOM % ${#STATUSES[@]}))]}"
        ics="$(build_ics "$uid" "$summary" "${daystamp}T${start_hm}" "$end" 0 \
              "$(pick "${LOCATIONS[$slug]}")" "$summary - jeu de test ($slug)." \
              "" "$status" "$((RANDOM % 3))")"
      fi

      if put_event "$slug" "$uid" "$ics"; then
        TOTAL=$((TOTAL + 1)); count_cal=$((count_cal + 1))
      fi
    done
  done

  n=$((n + 1))
  uid="seed-$slug-weekly-$n"
  anchor="$(date -d "$WEEK_START +$((RANDOM % 5)) days" +%Y%m%d)"
  anchor_date="$(date -d "$WEEK_START +$((RANDOM % 5)) days" +%Y-%m-%d)"
  rh="${HOURS[$((RANDOM % ${#HOURS[@]}))]}"
  rend="$(date -d "$anchor_date $rh:00 60 minutes" +%Y%m%dT%H%M%S)"
  ics="$(build_ics "$uid" "[Récurrent] $(pick "${SUMMARIES[$slug]}")" \
        "${anchor}T$(printf '%02d0000' "$rh")" "$rend" 0 \
        "$(pick "${LOCATIONS[$slug]}")" "Série hebdomadaire du jeu de test." \
        "FREQ=WEEKLY;COUNT=$WEEKS" "CONFIRMED" 0)"
  put_event "$slug" "$uid" "$ics" && { TOTAL=$((TOTAL + 1)); count_cal=$((count_cal + 1)); }

  n=$((n + 1))
  uid="seed-$slug-multiday-$n"
  off=$((RANDOM % (TOTAL_DAYS - 3)))
  md_start="$(date -d "$WEEK_START +$off days" +%Y%m%d)"
  md_end="$(date -d "$WEEK_START +$((off + 3)) days" +%Y%m%d)"
  ics="$(build_ics "$uid" "[Multi-jours] $(pick "${SUMMARIES[$slug]}")" \
        "$md_start" "$md_end" 1 "" "Événement sur plusieurs jours." "" "CONFIRMED" 0)"
  put_event "$slug" "$uid" "$ics" && { TOTAL=$((TOTAL + 1)); count_cal=$((count_cal + 1)); }

  echo "    $slug: $count_cal events"
done

echo
echo "Done: $TOTAL events across $NCAL calendars ($WEEK_START -> $WEEK_END)"

if (( ${#FAILURES[@]} > 0 )); then
  echo "${#FAILURES[@]} failures:"
  for f in "${FAILURES[@]:0:20}"; do echo "  $f"; done
  exit 1
fi
