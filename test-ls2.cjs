const https = require("https");
const fs = require("fs");

const envVars = fs.readFileSync(".env", "utf8");
const match = envVars.match(/LEMONSQUEEZY_API_KEY=(.+)/);
const apiKey = match ? match[1].trim() : "";

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
        
        if (res.data && res.data.length > 0) {
            console.log("Customer found:", res.data[0].id);
            console.log("Portal URL:", res.data[0].attributes.urls.customer_portal);
        } else {
            console.log("Customer not found or invalid response:", JSON.stringify(res).substring(0, 500));
        }
    } catch (e) {
        console.error(e);
    }
}

run();
