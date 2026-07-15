const https = require("https");
const dotenv = require("dotenv");
dotenv.config({ path: "functions/.env" });

const apiKey = process.env.LEMONSQUEEZY_API_KEY;

function lsRequest(path) {
    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: "api.lemonsqueezy.com",
            path: path,
            method: "GET",
            headers: {
                "Accept": "application/vnd.api+json",
                "Content-Type": "application/vnd.api+json",
                "Authorization": `Bearer ${apiKey}`
            }
        }, (res) => {
            let data = "";
            res.on("data", chunk => data += chunk);
            res.on("end", () => resolve(JSON.parse(data)));
        });
        req.on("error", reject);
        req.end();
    });
}

async function run() {
    try {
        const email = "thriftedukay1@gmail.com";
        const res = await lsRequest(`/v1/customers?filter[email]=${encodeURIComponent(email)}`);
        console.log("Customer search response:", JSON.stringify(res, null, 2));
    } catch (e) {
        console.error(e);
    }
}

run();
