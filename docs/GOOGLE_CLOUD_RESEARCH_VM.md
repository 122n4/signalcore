# Google Cloud Research VM

This is the short path to move Syntrake Research Lab away from the local PC.

## Goal

Run the Research Lab supervisor 24/7 on a Google Cloud VM and sync status/results to Supabase so `/ops/lab` can read remote state.

## Safe VM Settings

Use these settings when creating the VM:

- Product: `Compute Engine` -> `VM instances`
- Region: `us-central1`, `us-east1`, or `us-west1`
- Machine: `e2-micro` for free-tier attempt, or `e2-small` for more stable trial-credit usage
- Boot disk: `Ubuntu 24.04 LTS`
- Disk type: `Standard persistent disk`
- Disk size: `30 GB`
- Firewall: HTTP/HTTPS can stay enabled, but the worker itself does not require public web ports

Avoid:

- GPUs
- Windows Server images
- Large disks
- Load balancers
- Cloud SQL
- Kubernetes/GKE

## Create With Cloud Shell

Open Cloud Shell in Google Cloud and run:

```bash
gcloud services enable compute.googleapis.com

gcloud compute instances create syntrake-research-01 \
  --zone=us-central1-a \
  --machine-type=e2-micro \
  --image-family=ubuntu-2404-lts-amd64 \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=30GB \
  --boot-disk-type=pd-standard \
  --tags=syntrake-research
```

If `e2-micro` is too weak, stop the instance and resize to `e2-small` while trial credits are active.

## Install The Worker

SSH into the VM from Google Cloud and run:

```bash
SYNTRAKE_BRANCH=research-lab-vps bash -c "$(curl -fsSL https://raw.githubusercontent.com/122n4/signalcore/research-lab-vps/scripts/trading/bootstrapResearchVps.sh)"
```

Then edit:

```bash
nano ~/syntrake-research/.env.research
```

Fill at least:

```bash
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
RESEARCH_SUPABASE_SYNC=1
```

Recommended provider keys:

```bash
TWELVEDATA_API_KEYS=
FINNHUB_API_KEY=
FMP_API_KEY=
ALPHA_VANTAGE_API_KEY=
```

Restart after editing:

```bash
cd ~/syntrake-research
set -a
. ./.env.research
set +a
pm2 restart all
pm2 save
```

## Verify

```bash
pm2 status
npm run research:lab-health
npm run research:sync
```

Then open:

```text
https://syntrake.com/ops/lab
```

The page should show remote/Supabase-backed lab status instead of relying on local files.

## Important Current Limitation

The bootstrap command pulls from the `research-lab-vps` branch on GitHub. If that branch is later merged into `main`, the command can be changed back to `main`.
