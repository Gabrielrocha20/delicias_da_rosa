import os

os.environ['DB_ENGINE'] = 'sqlite'
os.environ.setdefault('DJANGO_SECRET_KEY', 'test-secret-key-only-for-the-automated-test-suite-0123456789')
os.environ.pop('ANTHROPIC_API_KEY', None)

from .settings import *  # noqa: E402,F403


DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': ':memory:',
    }
}

STORAGES['staticfiles'] = {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'}
REST_FRAMEWORK = {**REST_FRAMEWORK, 'DEFAULT_THROTTLE_RATES': {'login': '1000/min', 'assistant': '1000/min'}}
PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher']
DEBUG = False
LOGGING['root']['level'] = 'ERROR'
LOGGING['loggers']['django.request'] = {'level': 'ERROR'}
