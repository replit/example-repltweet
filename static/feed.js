'use strict';
const ele = (tagname, content, c) => {
    const e = document.createElement(tagname)
    if (content) e.innerText = content
    if (c) e.classList.add(c)
    return e
}

function msg(msg, isError) {
    const d = ele('div', msg)
    const goodColors = {
        color: '#155724',
        backgroundColor: '#d4edda',
        borderColor: '#c3e6cb'
    }
    const errorColors = {
        backgroundColor: '#f8d7da',
        color: '#721c24',
        borderColor: '#f5c6cb',
    }

    Object.assign(d.style, {
        padding: '5px',

        maxWidth: '50vw',
        minWidth: '100px',
        minHeight: '30px',

        display: 'flex',
        alignItems: 'center',

        position: 'fixed',
        bottom: '1rem',
        right: '1rem',
    }, isError? errorColors : goodColors)

    document.body.appendChild(d)
    setTimeout(() => document.body.removeChild(d), 4000)
}


async function apiRequest(route, obj) {
    let parts = [];
    for (var p in obj) {
        if (obj.hasOwnProperty(p)) {
            parts.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p]));
        }
    }
    const data = parts.join("&");

    let res
    try {
        res = await fetch(route, {
            method: "POST",
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: data
        }).then(async res => {
            // even if the status code is bad, try to show the error sent in JSON

            let err = `Unexpected status code ${res.status}`
            let json = {}
            try {
                json = await res.json()
            }catch(e) {
                console.error(e)
                throw new Error(res.ok ? err : "Couldn't parse response")
            }
            if (!res.ok) {
                console.log(json)
                throw new Error(json.error || err)
            }
            return json
        })
    } catch(e) {
        console.error(`Error in request to ${route}:`, e)
        res = {error: e}
    }
    return res
}


class LikeButton {
    constructor(tweet) {
        // save this for the like request
        this.tweet = tweet
        // create elements
        this.btn = ele('button', '', 'like')
        this.i = ele('i', '', 'fa')
        this.btn.appendChild(this.i)
        this.btn.onclick = (() => this.click())
        this.liked = tweet.likes.includes(USERNAME)
        this.update()
    }

    update() {
        // toggle whether heart is filled in
        this.i.classList.remove('fa-heart')
        this.i.classList.remove('fa-heart-o')
        this.i.classList.add(this.liked ? 'fa-heart' : 'fa-heart-o')
    }

    toggle() {
        this.liked = !this.liked
        this.update()
    }

    async click() {
        this.toggle()
        const { author, ts } = this.tweet
        const action = this.liked ? 'like' : 'unlike'
        try {
            const res = await apiRequest("/api/like", { author, ts, action })
            if (res.error) {
                throw new Error(res.error)
            }
        } catch(e) {
            msg(e.message ? e.message : e, true)
            // If the action didn't complete successfully,
            //  toggle back to the state the server thinks
            this.toggle()
        }
    }
}


class TrashButton {
    constructor(tweet) {
        this.tweet = tweet
        // make element
        this.btn = ele('button')
        this.btn.classList.add('trash')
        this.btn.innerHTML = '<i class="fa fa-trash" aria-hidden="true"></i>'
        this.btn.onclick = (() => this.click())
    }

    async click() {
        if (!confirm("Are you sure you want to delete this tweet?")) return
        const { author, ts } = this.tweet
        const res = await apiRequest("/api/delete", { author, ts })
        if (res.error) {
            msg(res.error, true)
        } else {
            refreshFeed()
        }
    }
}


async function refreshFeed() {
    const tweetsDiv = document.getElementById('tweets')
    tweetsDiv.innerHTML = '<div class="spinner spinner-med"></div>'

    // fetch feed
    const data = await fetch("/api/feed").then(r => r.json())
    // check for errors
    if (data.error) {
        tweetsDiv.innerHTML = "" // clear loading indicator
        return msg("Error: " + data.error, true)
    }
    // clear tweets
    tweetsDiv.innerHTML = "";
    if (!data.tweets) {
        tweetsDiv.innerHTML = "No tweets..."
        return
    }
    // render each tweet
    data.tweets.forEach(tweet => {
        console.log(tweet)
        const tDiv = document.createElement('div')
        // tweet header
        const tHead = ele('div')
        tHead.appendChild(ele('b', tweet.author || "User", 'tweet-name'))
        tHead.appendChild(ele('i', moment.unix(tweet.ts).fromNow(), 'tweet-ts'))
        tDiv.appendChild(tHead)
        // body
        tDiv.appendChild(ele('p', tweet.body || ""))
        // buttons
        const tButtons = ele('div')
        tButtons.appendChild(ele('b', `${tweet.likes.length} like${tweet.likes.length == 1?' ':'s'}`, 'likes-label'))
        const likeButton = new LikeButton(tweet)
        tButtons.appendChild(likeButton.btn)
        if (tweet.author == USERNAME || MOD) {
            const trashButton = new TrashButton(tweet)
            tButtons.appendChild(trashButton.btn)
        }
        tDiv.appendChild(tButtons)
        // render the tweet
        tweetsDiv.appendChild(tDiv)
    })
}

const postBtn = document.getElementById('tweet-btn')

async function submitTweet() {
    const tweetArea = document.getElementById('tweet-area')
    const body = tweetArea.value

    if (!body) {
        return msg("Error: Tweet cannot be empty", true)
    }

    // show loading indicator
    postBtn.innerHTML = '<div class="spinner spinner-sm"></div>'
    // perform API request
    const res = await apiRequest("/api/tweet", { body })
    // remove loading indicator
    postBtn.innerHTML = "Post"

    if (res.error) {
        return msg(res.error, true)
    }
    // clear tweet area
    tweetArea.value = ""
    msg("Tweet posted")
}

postBtn.onclick = submitTweet
document.getElementById('refresh-btn').onclick = refreshFeed
refreshFeed()
