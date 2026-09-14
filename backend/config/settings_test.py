import os

os.environ['DB_ENGINE'] = 'sqlite'

from .settings import *  # noqa: E402,F403


DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': ':memory:',
    }
}

PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher']
DEBUG = False
