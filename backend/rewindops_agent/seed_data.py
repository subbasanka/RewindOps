"""Seed MongoDB with AcmeSub demo data."""

import asyncio
import json
from pathlib import Path
from motor.motor_asyncio import AsyncIOMotorClient
from rewindops_agent.config import (
    MONGODB_URI,
    MONGODB_DATABASE_BUSINESS,
    MONGODB_DATABASE_REWINDOPS,
)

SAMPLE_DATA_DIR = Path(__file__).parent.parent.parent / "sample-data"


async def seed():
    client = AsyncIOMotorClient(MONGODB_URI)
    business_db = client[MONGODB_DATABASE_BUSINESS]
    rewindops_db = client[MONGODB_DATABASE_REWINDOPS]

    print(f"Connected to MongoDB: {MONGODB_URI[:30]}...")
    print(f"Seeding database: {MONGODB_DATABASE_BUSINESS}")

    collections_to_seed = {
        "customers": SAMPLE_DATA_DIR / "customers.json",
        "subscriptions": SAMPLE_DATA_DIR / "subscriptions.json",
        "invoices": SAMPLE_DATA_DIR / "invoices.json",
    }

    for collection_name, data_file in collections_to_seed.items():
        collection = business_db[collection_name]
        await collection.drop()

        with open(data_file) as f:
            documents = json.load(f)

        if documents:
            await collection.insert_many(documents)
            print(f"  {collection_name}: inserted {len(documents)} documents")

    rewindops_collections = [
        "action_checkpoints",
        "action_receipts",
        "rollback_events",
    ]
    for coll_name in rewindops_collections:
        await rewindops_db[coll_name].drop()
        print(f"  {coll_name}: cleared")

    print("Seed complete.")
    client.close()


def main():
    asyncio.run(seed())


if __name__ == "__main__":
    main()
