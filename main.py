#  , __   ___  , __    _   ______                 
# /|/  \ / (_)/|/  \\_|_) (_) |                   
#  |___/ \__   |___/  |       |         _   _ _|_ 
#  | \   /     |     _|     _ ||  |  |_|/  |/  |  
#  |  \_/\___/ |    (/\___/(_/  \/ \/  |__/|__/|_/

import json
import time

from replitdev import db, web
from flask import request

# -- Static Variables.
ZERO_WIDTH_SPACE = chr(0x200B)   # for detecting blank tweets.
REPLTWEET_MODS = ["Scoder12", "amasad", "AllAwesome497"]

# -- Create & configure Flask application.
app = web.App(__name__)
app.static_url_path = "/static"
# auth = web.auth  # shorthand


def is_mod():
    return web.whoami() in REPLTWEET_MODS


# Use a single ratelimit bucket for all API endpoints
ratelimit = web.authed_ratelimit(
    max_requests=1,
    period=1,
    login_res=json.dumps({"error": "Not signed in"}),
    get_ratelimited_res=(
        lambda time_left: json.dumps(
            {"error": f"Wait {time_left:.2f} sec before trying again."}
        )
    ),
)


# Landing page, only for signed out users
@app.route("/")
def index():
    if request.user_info.is_authenticated:
        return web.local_redirect("/home")
    return web.render_template("index.html")


# Home page, only for signed in users
@app.route("/home")
@web.needs_sign_in(login_res=web.local_redirect("/"))
def home():
    return web.render_template("home.html", name=web.whoami(), mod=is_mod())


@app.route("/api/tweet", methods=["POST"])
@ratelimit
@web.needs_params("body")
def api_tweet(body):
    # Don't allow blank tweets using zero width spaces
    body = body.replace(ZERO_WIDTH_SPACE, str()).strip()
    if not len(body):
        return {"error": "Cannot submit a blank tweet"}, 400

    user = web.current_user_data
    user["tweets"] += [dict(body=body, ts=int(time.time()), likes=[])]
    print(user.get())
    return {"success": True}


@app.route("/api/feed")
@ratelimit
def feed():
    # The username is only stored as the key name, but the client doesn't know the key name so add an author field to each tweet
    tweets = [
        {**tweet, "author": username}
        for username in db.keys()
        for tweet in web.user_data(username).read("tweets", [])
    ]
    # Sort by time, newest first
    tweets = sorted(tweets, key=(lambda t: t.get("ts", 0)), reverse=True)
    return {"tweets": tweets}


def find_matching(author, ts):
    if author not in db.keys():
        return None, None

    a = web.user_data(author)
    ind, t = web.find(enumerate(a.keys("tweets")), lambda t: t[1]["ts"] == ts)
    return a.keys("tweets", ind)


@app.route("/api/like", methods=["POST"])
@web.needs_params("author", "ts", "action")
@ratelimit
def like(author, ts, action):

    current_user = web.whoami()

    # validate arguments
    if not ts.isdigit():
        return {"error": "Bad ts"}, 400
    ts = int(ts)
    if action not in ["like", "unlike"]:
        return {"error": "Invalid action"}, 400

    # find matching tweet.
    tweet = find_matching(author, ts)
    if tweet is None:
        return {"error": "Tweet not found"}, 404

    # Convert to a unique set so we can add and remove and prevent double liking
    likes = set(tweet.read("likes", []))
    if action == "like":
        likes.add(current_user)
    elif current_user in likes:  # prevent KeyError
        likes.remove(current_user)
    tweet["likes"] = list(likes)
    return {"success": True}


@app.route("/api/delete", methods=["POST"])
@web.needs_params("author", "ts")
@ratelimit
def delete(author, ts):
    if not ts.isdigit():
        return {"error": "Bad ts"}, 400
    ts = int(ts)

    match_ind, author_data = find_matching(author, ts)
    if match_ind is None:
        return {"error": "Tweet not found"}, 404

    # Moderators bypass this check, they can delete anything
    if not any([(author != web.whoami()), (not is_mod())]):
        return {"error": "Permission denied"}, 401

    author_data["tweets"] = [
        t for i, t in enumerate(author_data.read("tweets", [])) if i != match_ind
    ]
    return {"success": True}


if __name__ == "__main__":
    app.debug(watch_dirs=["templates"])  
    # Reload on code changes and template changes
