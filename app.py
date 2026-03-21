from flask import Flask, session, request, jsonify, render_template, redirect, url_for
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps
from datetime import datetime
from authlib.integrations.flask_client import OAuth
import os
import json
import secrets
import yfinance as yf
import requests

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///fintrack.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'fintrack_secret_key_2026_change_in_prod')
CORS(app, supports_credentials=True)
db = SQLAlchemy(app)

# ─── GOOGLE OAUTH ────────────────────────────────
oauth = OAuth(app)
google = oauth.register(
    name='google',
    client_id=os.environ.get('GOOGLE_CLIENT_ID', ''),
    client_secret=os.environ.get('GOOGLE_CLIENT_SECRET', ''),
    server_metadata_url='https://accounts.google.com/.well-known/openid-configuration',
    client_kwargs={'scope': 'openid email profile'},
)

# ─── AUTH HELPERS ────────────────────────────────
def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            if request.path.startswith('/api/'):
                return jsonify({'status': 'error', 'message': 'Not authenticated'}), 401
            return redirect(url_for('login_page'))
        return f(*args, **kwargs)
    return decorated

def current_user_id():
    return session.get('user_id')

# --- Models ---
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=True)
    password_hash = db.Column(db.String(256), nullable=False)
    display_name = db.Column(db.String(100))
    profile_picture = db.Column(db.String(255))
    google_picture = db.Column(db.String(255))
    created = db.Column(db.DateTime, default=datetime.utcnow)

    def set_password(self, pw):
        self.password_hash = generate_password_hash(pw)

    def check_password(self, pw):
        return check_password_hash(self.password_hash, pw)

class Asset(db.Model):
    id = db.Column(db.String(50), primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    asset_class = db.Column(db.String(50), nullable=False)
    value = db.Column(db.Float, default=0.0)
    cost = db.Column(db.Float, default=0.0)
    purchase_date = db.Column(db.String(50))
    qty = db.Column(db.Float)
    ticker = db.Column(db.String(50))
    last_price = db.Column(db.Float)
    notes = db.Column(db.Text)
    added = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'assetClass': self.asset_class,
            'value': self.value,
            'cost': self.cost,
            'purchaseDate': self.purchase_date,
            'qty': self.qty,
            'ticker': self.ticker,
            'lastPrice': self.last_price,
            'notes': self.notes,
            'added': self.added.isoformat() if self.added else None
        }

class Liability(db.Model):
    id = db.Column(db.String(50), primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    type = db.Column(db.String(50), nullable=False)
    amount = db.Column(db.Float, default=0.0)
    emi = db.Column(db.Float, default=0.0)
    rate = db.Column(db.Float, default=0.0)
    tenure = db.Column(db.Integer)
    loan_start_date = db.Column(db.String(50))
    original_principal = db.Column(db.Float, default=0.0)
    added = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'type': self.type,
            'amount': self.amount,
            'emi': self.emi,
            'rate': self.rate,
            'tenure': self.tenure,
            'loanStartDate': self.loan_start_date,
            'originalPrincipal': self.original_principal or self.amount,
            'added': self.added.isoformat() if self.added else None
        }

class Income(db.Model):
    id = db.Column(db.String(50), primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    source = db.Column(db.String(100), nullable=False)
    category = db.Column(db.String(50), nullable=False)
    amount = db.Column(db.Float, default=0.0)
    date = db.Column(db.String(50), nullable=False)
    recurring = db.Column(db.Boolean, default=False)
    added = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'source': self.source,
            'category': self.category,
            'amount': self.amount,
            'date': self.date,
            'recurring': self.recurring,
            'added': self.added.isoformat() if self.added else None
        }

class Expense(db.Model):
    id = db.Column(db.String(50), primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    description = db.Column(db.String(200), nullable=False)
    category = db.Column(db.String(50), nullable=False)
    amount = db.Column(db.Float, default=0.0)
    date = db.Column(db.String(50), nullable=False)
    recurring = db.Column(db.Boolean, default=False)
    added = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'description': self.description,
            'category': self.category,
            'amount': self.amount,
            'date': self.date,
            'recurring': self.recurring,
            'added': self.added.isoformat() if self.added else None
        }

class Goal(db.Model):
    id = db.Column(db.String(50), primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    category = db.Column(db.String(50), nullable=False)
    target = db.Column(db.Float, default=0.0)
    current = db.Column(db.Float, default=0.0)
    target_date = db.Column(db.String(50))
    priority = db.Column(db.String(20))
    created = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'category': self.category,
            'target': self.target,
            'current': self.current,
            'targetDate': self.target_date,
            'priority': self.priority,
            'created': self.created.isoformat() if self.created else None
        }

class Bill(db.Model):
    id = db.Column(db.String(50), primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    category = db.Column(db.String(50), nullable=False)
    amount = db.Column(db.Float, default=0.0)
    due_day = db.Column(db.Integer, default=1)
    frequency = db.Column(db.String(50))
    icon = db.Column(db.String(10), default='💳')
    added = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'category': self.category,
            'amount': self.amount,
            'dueDay': self.due_day,
            'frequency': self.frequency,
            'icon': self.icon,
            'added': self.added.isoformat() if self.added else None
        }

class Snapshot(db.Model):
    id = db.Column(db.String(50), primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    date = db.Column(db.Float)
    net_worth = db.Column(db.Float)
    total_assets = db.Column(db.Float)
    total_liabilities = db.Column(db.Float)
    asset_count = db.Column(db.Integer)
    by_class = db.Column(db.Text)

    def to_dict(self):
        return {
            'id': self.id,
            'date': self.date,
            'netWorth': self.net_worth,
            'totalAssets': self.total_assets,
            'totalLiabilities': self.total_liabilities,
            'assetCount': self.asset_count,
            'byClass': json.loads(self.by_class) if self.by_class else {}
        }

class Settings(db.Model):
    id = db.Column(db.Integer, primary_key=True)  # = user_id
    annual_income = db.Column(db.Float, default=0.0)
    term_insurance = db.Column(db.Float, default=0.0)
    health_insurance = db.Column(db.Float, default=0.0)
    emergency_months = db.Column(db.Integer, default=6)
    monthly_sip_budget = db.Column(db.Float, default=0.0)
    budgets = db.Column(db.Text)

    def to_dict(self):
        return {
            'annualIncome': self.annual_income,
            'termInsurance': self.term_insurance,
            'healthInsurance': self.health_insurance,
            'emergencyMonths': self.emergency_months,
            'monthlySipBudget': self.monthly_sip_budget,
            'budgets': json.loads(self.budgets) if self.budgets else {}
        }

class SIPInstrument(db.Model):
    id = db.Column(db.String(50), primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    percentage = db.Column(db.Float, default=0.0)
    added = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'percentage': self.percentage,
            'added': self.added.isoformat() if self.added else None
        }

# ─── AUTH ROUTES ────────────────────────────────
@app.route('/login')
def login_page():
    if 'user_id' in session:
        return redirect(url_for('index'))
    return render_template('login.html')

@app.route('/api/auth/google')
def google_login():
    redirect_uri = url_for('google_callback', _external=True)
    return google.authorize_redirect(redirect_uri)

@app.route('/api/auth/google/callback')
def google_callback():
    try:
        token = google.authorize_access_token()
        userinfo = token.get('userinfo')
        if not userinfo:
            return redirect('/login?error=google_failed')

        email = userinfo.get('email', '').lower()
        display_name = userinfo.get('name', email.split('@')[0])
        picture = userinfo.get('picture')
        # Derive a safe username from email
        username = email.split('@')[0].replace('.', '_').lower()

        # Find or create user
        user = User.query.filter_by(email=email).first()
        if not user:
            # Make username unique if taken
            base = username
            i = 1
            while User.query.filter_by(username=username).first():
                username = f'{base}_{i}'
                i += 1
            user = User(
                username=username,
                email=email,
                display_name=display_name,
                profile_picture=picture,
                google_picture=picture
            )
            user.set_password(secrets.token_hex(24))  # random unusable password
            db.session.add(user)
            db.session.commit()
            s = Settings(id=user.id)
            db.session.add(s)
            db.session.commit()
        else:
            if picture:
                user.google_picture = picture
                if not user.profile_picture: # only set if current is empty
                    user.profile_picture = picture
                db.session.commit()

        session['user_id'] = user.id
        session['username'] = user.username
        session['display_name'] = user.display_name or user.username
        session['profile_picture'] = user.profile_picture
        return redirect('/')
    except Exception as e:
        app.logger.error(f'Google OAuth error: {e}')
        return redirect('/login?error=google_failed')

@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.json
    username = (data.get('username') or '').strip().lower()
    password = data.get('password', '')
    display_name = data.get('displayName', username)
    email = data.get('email', '').strip().lower() or None

    if not username or not password:
        return jsonify({'status': 'error', 'message': 'Username and password required'}), 400
    if len(username) < 3:
        return jsonify({'status': 'error', 'message': 'Username must be at least 3 characters'}), 400
    if len(password) < 6:
        return jsonify({'status': 'error', 'message': 'Password must be at least 6 characters'}), 400
    if User.query.filter_by(username=username).first():
        return jsonify({'status': 'error', 'message': 'Username already taken'}), 400

    user = User(username=username, display_name=display_name or username, email=email)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()

    # Auto-create settings for new user
    s = Settings(id=user.id)
    db.session.add(s)
    db.session.commit()

    session['user_id'] = user.id
    session['username'] = user.username
    session['display_name'] = user.display_name
    return jsonify({'status': 'success', 'username': user.username, 'displayName': user.display_name})

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.json
    username = (data.get('username') or '').strip().lower()
    password = data.get('password', '')
    user = User.query.filter_by(username=username).first()
    if not user or not user.check_password(password):
        return jsonify({'status': 'error', 'message': 'Invalid username or password'}), 401
    session['user_id'] = user.id
    session['username'] = user.username
    session['display_name'] = user.display_name or user.username
    return jsonify({'status': 'success', 'username': user.username, 'displayName': user.display_name})

@app.route('/api/auth/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'status': 'success'})

@app.route('/api/auth/me', methods=['GET'])
def auth_me():
    if 'user_id' not in session:
        return jsonify({'loggedIn': False}), 200
    user = User.query.get(session['user_id'])
    if not user:
        return jsonify({'loggedIn': False}), 200
    return jsonify({'loggedIn': True, 'username': user.username, 'displayName': user.display_name, 'email': user.email or '', 'profilePicture': user.profile_picture, 'googlePicture': user.google_picture})

@app.route('/api/auth/update-profile', methods=['POST'])
@login_required
def update_profile():
    data = request.json
    user = User.query.get(session['user_id'])
    if not user:
        return jsonify({'success': False, 'error': 'User not found'}), 404
    if data.get('displayName'):
        user.display_name = data['displayName'].strip()
        session['display_name'] = user.display_name
    if data.get('email') is not None:
        user.email = data['email'].strip().lower() or None
    if 'profilePicture' in data:
        user.profile_picture = data['profilePicture']
        session['profile_picture'] = user.profile_picture
    db.session.commit()
    return jsonify({'success': True})

@app.route('/api/auth/sync-google-profile', methods=['POST'])
@login_required
def sync_google_profile():
    user = User.query.get(session['user_id'])
    if not user.google_picture:
        return jsonify({'success': False, 'message': 'No Google account linked. Please log in with Google first.'}), 400
    user.profile_picture = user.google_picture
    db.session.commit()
    return jsonify({'success': True})

@app.route('/api/auth/change-password', methods=['POST'])
@login_required
def change_password():
    data = request.json
    user = User.query.get(session['user_id'])
    if not user:
        return jsonify({'success': False, 'error': 'User not found'}), 404
    if not user.check_password(data.get('oldPassword', '')):
        return jsonify({'success': False, 'error': 'Current password is incorrect'}), 400
    new_pw = data.get('newPassword', '')
    if len(new_pw) < 6:
        return jsonify({'success': False, 'error': 'Password must be at least 6 characters'}), 400
    user.set_password(new_pw)
    db.session.commit()
    return jsonify({'success': True})

@app.route('/api/auth/delete-account', methods=['POST'])
@login_required
def delete_account():
    user_id = session['user_id']
    # Delete all user data
    from sqlalchemy import text
    for table in ['Asset', 'Liability', 'Income', 'Expense', 'Goal', 'Bill', 'Snapshot', 'Settings']:
        model = globals().get(table)
        if model:
            model.query.filter_by(id=user_id).delete()
    User.query.filter_by(id=user_id).delete()
    db.session.commit()
    session.clear()
    return jsonify({'success': True})

# ─── MAIN APP ROUTE ────────────────────────────────
@app.route('/')
@login_required
def index():
    return render_template('index.html', display_name=session.get('display_name', 'User'))

@app.route('/api/db', methods=['GET'])
@login_required
def get_db():
    uid = current_user_id()
    assets = [a.to_dict() for a in Asset.query.filter_by(user_id=uid).all()]
    liabilities = [l.to_dict() for l in Liability.query.filter_by(user_id=uid).all()]
    income = [i.to_dict() for i in Income.query.filter_by(user_id=uid).all()]
    expenses = [e.to_dict() for e in Expense.query.filter_by(user_id=uid).all()]
    goals = [g.to_dict() for g in Goal.query.filter_by(user_id=uid).all()]
    bills = [b.to_dict() for b in Bill.query.filter_by(user_id=uid).all()]
    snapshots = [s.to_dict() for s in Snapshot.query.filter_by(user_id=uid).all()]
    sips = [sip.to_dict() for sip in SIPInstrument.query.filter_by(user_id=uid).all()]

    settings_obj = Settings.query.get(uid)
    if not settings_obj:
        settings_obj = Settings(id=uid)
        db.session.add(settings_obj)
        db.session.commit()
    settings = settings_obj.to_dict()

    return jsonify({
        'assets': assets,
        'liabilities': liabilities,
        'income': income,
        'expenses': expenses,
        'goals': goals,
        'bills': bills,
        'snapshots': snapshots,
        'sips': sips,
        'budgets': settings['budgets'],
        'settings': {
            'annualIncome': settings['annualIncome'],
            'termInsurance': settings['termInsurance'],
            'healthInsurance': settings['healthInsurance'],
            'emergencyMonths': settings['emergencyMonths'],
            'monthlySipBudget': settings['monthlySipBudget']
        }
    })

@app.route('/api/assets', methods=['POST'])
@login_required
def add_asset():
    data = request.json
    asset = Asset(
        id=data.get('id'), user_id=current_user_id(),
        name=data.get('name'), asset_class=data.get('assetClass'),
        value=float(data.get('value', 0)), cost=float(data.get('cost', 0)),
        purchase_date=data.get('purchaseDate'), qty=data.get('qty'),
        ticker=data.get('ticker'), notes=data.get('notes')
    )
    db.session.add(asset); db.session.commit()
    return jsonify({'status': 'success'})

@app.route('/api/assets/<id>', methods=['PUT', 'DELETE'])
@login_required
def asset_detail(id):
    asset = Asset.query.filter_by(id=id, user_id=current_user_id()).first()
    if not asset: return jsonify({'status': 'error'}), 404
    if request.method == 'PUT':
        data = request.json
        asset.name = data.get('name', asset.name)
        asset.asset_class = data.get('assetClass', asset.asset_class)
        asset.value = float(data.get('value', asset.value))
        asset.cost = float(data.get('cost', asset.cost))
        asset.purchase_date = data.get('purchaseDate', asset.purchase_date)
        asset.qty = data.get('qty', asset.qty)
        asset.ticker = data.get('ticker', asset.ticker)
        asset.notes = data.get('notes', asset.notes)
    else:
        db.session.delete(asset)
    db.session.commit(); return jsonify({'status': 'success'})

@app.route('/api/liabilities', methods=['POST'])
@login_required
def add_liab():
    data = request.json
    l = Liability(
        id=data.get('id'), user_id=current_user_id(),
        name=data.get('name'), type=data.get('type'),
        amount=float(data.get('amount', 0)),
        emi=float(data.get('emi', 0)),
        rate=float(data.get('rate', 0)),
        tenure=data.get('tenure'),
        loan_start_date=data.get('loanStartDate'),
        original_principal=float(data.get('originalPrincipal') or data.get('amount', 0))
    )
    db.session.add(l); db.session.commit(); return jsonify({'status': 'success'})

@app.route('/api/liabilities/<id>', methods=['PUT', 'DELETE'])
@login_required
def liab_detail(id):
    l = Liability.query.filter_by(id=id, user_id=current_user_id()).first()
    if not l: return jsonify({'status': 'error'}), 404
    if request.method == 'PUT':
        data = request.json
        l.name = data.get('name', l.name)
        l.type = data.get('type', l.type)
        l.amount = float(data.get('amount', l.amount))
        l.emi = float(data.get('emi', l.emi))
        l.rate = float(data.get('rate', l.rate))
        l.tenure = data.get('tenure', l.tenure)
        l.loan_start_date = data.get('loanStartDate', l.loan_start_date)
        if data.get('originalPrincipal'):
            l.original_principal = float(data['originalPrincipal'])
    else:
        db.session.delete(l)
    db.session.commit(); return jsonify({'status': 'success'})

@app.route('/api/income', methods=['POST'])
@login_required
def add_income():
    data = request.json
    i = Income(id=data.get('id'), user_id=current_user_id(), source=data.get('source'), category=data.get('category'), amount=float(data.get('amount',0)), date=data.get('date'), recurring=data.get('recurring', False))
    db.session.add(i); db.session.commit(); return jsonify({'status': 'success'})

@app.route('/api/income/<id>', methods=['DELETE'])
@login_required
def del_income(id):
    i = Income.query.filter_by(id=id, user_id=current_user_id()).first()
    if i: db.session.delete(i); db.session.commit()
    return jsonify({'status': 'success'})

@app.route('/api/expenses', methods=['POST'])
@login_required
def add_expense():
    data = request.json
    e = Expense(id=data.get('id'), user_id=current_user_id(), description=data.get('description'), category=data.get('category'), amount=float(data.get('amount',0)), date=data.get('date'), recurring=data.get('recurring', False))
    db.session.add(e); db.session.commit(); return jsonify({'status': 'success'})

@app.route('/api/expenses/<id>', methods=['DELETE'])
@login_required
def del_expense(id):
    e = Expense.query.filter_by(id=id, user_id=current_user_id()).first()
    if e: db.session.delete(e); db.session.commit()
    return jsonify({'status': 'success'})

@app.route('/api/goals', methods=['POST'])
@login_required
def add_goal():
    data = request.json
    g = Goal(id=data.get('id'), user_id=current_user_id(), name=data.get('name'), category=data.get('category'), target=float(data.get('target',0)), current=float(data.get('current',0)), target_date=data.get('targetDate'), priority=data.get('priority'))
    db.session.add(g); db.session.commit(); return jsonify({'status': 'success'})

@app.route('/api/goals/<id>', methods=['PUT', 'DELETE'])
@login_required
def goal_detail(id):
    g = Goal.query.filter_by(id=id, user_id=current_user_id()).first()
    if not g: return jsonify({'status': 'error'}), 404
    if request.method == 'PUT':
        data = request.json
        g.name=data.get('name'); g.category=data.get('category'); g.target=data.get('target'); g.current=data.get('current'); g.target_date=data.get('targetDate'); g.priority=data.get('priority')
    else: db.session.delete(g)
    db.session.commit(); return jsonify({'status': 'success'})

@app.route('/api/bills', methods=['POST'])
@login_required
def add_bill():
    data = request.json
    b = Bill(id=data.get('id'), user_id=current_user_id(), name=data.get('name'), category=data.get('category'), amount=float(data.get('amount',0)), due_day=int(data.get('dueDay',1)), frequency=data.get('frequency'), icon=data.get('icon'))
    db.session.add(b); db.session.commit(); return jsonify({'status': 'success'})

@app.route('/api/bills/<id>', methods=['PUT', 'DELETE'])
@login_required
def bill_detail(id):
    b = Bill.query.filter_by(id=id, user_id=current_user_id()).first()
    if not b: return jsonify({'status': 'error'}), 404
    if request.method == 'PUT':
        data = request.json
        b.name=data.get('name'); b.category=data.get('category'); b.amount=data.get('amount'); b.due_day=data.get('dueDay'); b.frequency=data.get('frequency'); b.icon=data.get('icon')
    else: db.session.delete(b)
    db.session.commit(); return jsonify({'status': 'success'})

@app.route('/api/snapshots', methods=['POST'])
@login_required
def add_snapshot():
    data = request.json
    s = Snapshot(id=data.get('id'), user_id=current_user_id(), date=data.get('date'), net_worth=data.get('netWorth'), total_assets=data.get('totalAssets'), total_liabilities=data.get('totalLiabilities'), asset_count=data.get('assetCount'), by_class=json.dumps(data.get('byClass')))
    db.session.add(s); db.session.commit(); return jsonify({'status': 'success'})

@app.route('/api/snapshots/<id>', methods=['DELETE'])
@login_required
def del_snapshot(id):
    s = Snapshot.query.filter_by(id=id, user_id=current_user_id()).first()
    if s: db.session.delete(s); db.session.commit()
    return jsonify({'status': 'success'})

@app.route('/api/settings', methods=['POST'])
@login_required
def save_settings():
    uid = current_user_id()
    data = request.json
    s = Settings.query.get(uid)
    if not s: s = Settings(id=uid)
    s.annual_income = data.get('annualIncome', s.annual_income)
    s.term_insurance = data.get('termInsurance', s.term_insurance)
    s.health_insurance = data.get('healthInsurance', s.health_insurance)
    s.emergency_months = data.get('emergencyMonths', s.emergency_months)
    db.session.add(s); db.session.commit(); return jsonify({'status': 'success'})

@app.route('/api/budgets', methods=['POST'])
@login_required
def save_budgets():
    uid = current_user_id()
    data = request.json
    s = Settings.query.get(uid)
    if not s: s = Settings(id=uid)
    s.budgets = json.dumps(data)
    db.session.add(s); db.session.commit(); return jsonify({'status': 'success'})

@app.route('/api/sip/budget', methods=['POST'])
@login_required
def save_sip_budget():
    uid = current_user_id()
    data = request.json
    s = Settings.query.get(uid)
    if not s: s = Settings(id=uid)
    s.monthly_sip_budget = float(data.get('monthlySipBudget', 0))
    db.session.add(s)
    db.session.commit()
    return jsonify({'status': 'success'})

@app.route('/api/sip/instrument', methods=['POST'])
@login_required
def add_sip_instrument():
    data = request.json
    sip = SIPInstrument(
        id=data.get('id'),
        user_id=current_user_id(),
        name=data.get('name'),
        percentage=float(data.get('percentage', 0))
    )
    db.session.add(sip)
    db.session.commit()
    return jsonify({'status': 'success'})

@app.route('/api/sip/instrument/<id>', methods=['DELETE'])
@login_required
def del_sip_instrument(id):
    sip = SIPInstrument.query.filter_by(id=id, user_id=current_user_id()).first()
    if sip:
        db.session.delete(sip)
        db.session.commit()
    return jsonify({'status': 'success'})

@app.route('/api/clear-all', methods=['POST'])
@login_required
def clear_all():
    uid = current_user_id()
    # Only delete current user's data
    Asset.query.filter_by(user_id=uid).delete()
    Liability.query.filter_by(user_id=uid).delete()
    Income.query.filter_by(user_id=uid).delete()
    Expense.query.filter_by(user_id=uid).delete()
    Goal.query.filter_by(user_id=uid).delete()
    Bill.query.filter_by(user_id=uid).delete()
    Snapshot.query.filter_by(user_id=uid).delete()
    SIPInstrument.query.filter_by(user_id=uid).delete()
    s = Settings.query.get(uid)
    if s:
        s.annual_income=0; s.term_insurance=0; s.health_insurance=0; s.emergency_months=6; s.monthly_sip_budget=0; s.budgets='{}'
    db.session.commit()
    return jsonify({'status': 'success'})

@app.route('/api/auth/fx-rates', methods=['GET'])
@login_required
def get_fx_rates():
    import requests
    try:
        # Fetching latest rates with INR as base
        r = requests.get('https://api.exchangerate-api.com/v4/latest/INR', timeout=5)
        return jsonify(r.json())
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/apply-recurring', methods=['POST'])
@login_required
def apply_recurring_route():
    return jsonify({'status': 'success'})

@app.route('/api/assets/sync-prices', methods=['POST'])
@login_required
def sync_assets_prices():
    uid = current_user_id()
    assets = Asset.query.filter_by(user_id=uid).all()
    updated = 0
    errors = 0

    mf_cache = {}

    for a in assets:
        if not a.ticker:
            continue
        
        try:
            new_price = None
            if a.asset_class == 'Mutual Funds':
                code = a.ticker.strip()
                if code in mf_cache:
                    new_price = mf_cache[code]
                else:
                    r = requests.get(f'https://api.mfapi.in/mf/{code}', timeout=5)
                    if r.ok:
                        data = r.json()
                        if 'data' in data and len(data['data']) > 0:
                            new_price = float(data['data'][0]['nav'])
                            mf_cache[code] = new_price
            else:
                ticker = yf.Ticker(a.ticker)
                info = ticker.fast_info
                if 'lastPrice' in info:
                    new_price = info['lastPrice']
                else:
                    hist = ticker.history(period='1d')
                    if not hist.empty:
                        new_price = hist['Close'].iloc[-1]
            
            if new_price:
                a.last_price = new_price
                if a.qty:
                    a.value = new_price * a.qty
                updated += 1
        except Exception as e:
            app.logger.error(f"Sync error for {a.name} ({a.ticker}): {e}")
            errors += 1
    
    db.session.commit()
    return jsonify({'status': 'success', 'updated': updated, 'errors': errors})

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
        # Safe migration: add new Liability columns if they don't exist (SQLite)
        import sqlite3
        db_path = app.config['SQLALCHEMY_DATABASE_URI'].replace('sqlite:///', '')
        try:
            conn = sqlite3.connect(db_path)
            cur = conn.cursor()
            migrations = [
                "ALTER TABLE liability ADD COLUMN loan_start_date VARCHAR(50)",
                "ALTER TABLE liability ADD COLUMN original_principal FLOAT DEFAULT 0.0",
            ]
            for sql in migrations:
                try:
                    cur.execute(sql)
                    conn.commit()
                except sqlite3.OperationalError:
                    pass  # Column already exists
            conn.close()
        except Exception as e:
            app.logger.warning(f"Migration warning: {e}")
    app.run(debug=True, host='0.0.0.0', port=5000)
