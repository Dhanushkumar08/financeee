from app import app, User
import json

with app.app_context():
    # Simulate a request context if needed, but here we just need to test the route
    with app.test_client() as client:
        # Set session for admin user
        with client.session_transaction() as sess:
            # Find the admin user
            admin = User.query.filter_by(email='dhanush13404418@gmail.com').first()
            if admin:
                sess['user_id'] = admin.id
                sess['username'] = admin.username
            else:
                print("Admin user not found in DB!")
        
        print("Fetching /api/admin/users...")
        r = client.get('/api/admin/users')
        print(f"Status: {r.status_code}")
        if r.status_code == 200:
            data = json.loads(r.data)
            print(f"Users found: {len(data)}")
            for u in data:
                print(f" - {u['username']}: Assets={u['totalAssets']}, Liabs={u['totalLiabilities']}, NW={u['netWorth']}")
        else:
            print(f"Error: {r.data.decode()}")
