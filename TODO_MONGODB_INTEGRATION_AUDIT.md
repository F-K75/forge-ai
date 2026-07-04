- [x] Implement startup Mongo ping (lifespan) to verify connection
- [x] Enforce MONGODB_URL usage (remove localhost default / require env)
- [x] Add /health/mongo-ping endpoint (MongoDB ping)
- [x] Add temporary CRUD verification endpoint (insert+read)
- [ ] Add collection list endpoint or internal function to enumerate used collections
- [x] Fix index creation error handling to fail health if critical indexes missing
- [x] Add Atlas/local detection guard (warn/fail if localhost used in non-dev)

