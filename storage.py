import json

class UserData:
    def __init__(self, username):
        self.username = None
        self.data = {}
    
    def save(self):
        db[self.username] = json.dumps(self.data)
