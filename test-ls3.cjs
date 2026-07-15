const https = require("https");
const apiKey = "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJhdWQiOiI5NGQ1OWNlZi1kYmI4LTRlYTUtYjE3OC1kMjU0MGZjZDY5MTkiLCJqdGkiOiIwMjZkNDY1ZjQ3Y2Q2OTNiZTE4OWQzZTc1NDYxOTI4Y2I2MjRjZmEyODVjNjI4MDEyY2Y0Yzc2MDU0MTU3NDkyYjYxZmVlYjM5ZWE2MzY4NyIsImlhdCI6MTc4NDAyNzg0OS4wMDU3MzksIm5iZiI6MTc4NDAyNzg0OS4wMDU3NDIsImV4cCI6NDk1NzAyNzIwMC4wNDQxNTYsInN1YiI6Ijc1MTg5MTQiLCJzY29wZXMiOltdfQ.kFajjpZ3WqlIgFVeCiK0mtOowjHutAlSXXJIZsi8CA-cFmogFezX_E6k3zd609Mh9trIhsHmSXQvjp5JAtINiWyXCRx2lGmMcatpnVbUNvIRkskAf82t1RTyP5RkN-PQmugWbVfOspDc4qOJvEUEZI4BHqCGOHNH_pO-GirTjXagPfiRnO0dayIpb0Y2LbfAcS9guV9sUwFLGqd153laa6yEm9WSbrVhsm6sZzKXbQcn36u9HiwEf5YOEf1R_cRfb4wG96kRejdCDQrISNU72oLv6gyOcbHTmEkwIaP95W7HebLIwiG0cERps2lQSfUhMNSJJo41GE1YhskAGhdQQAJzxkdDMjYPqW8MOjuuJgDN207VvQiG2r3h-OqRRrHgm9H6phkEpiLqM-guNpEe-5ookjHD18330U1VP_7zjY4kEiqbkyfyFZFwjPXeyfqLRDNUDc537R6d_lbglohzcUHh8YSYPGXm-_TUM37a4kaN2Zcu6iR8x0JWWPxU49Ny1J6nWMEDMcTwyqK26BsvWZ9SOCaDIeygXS1uYdipIy4KCsw13augRkCiFxGmw7kolmIQNtmVD57oGVcxRSjuAE_wArry4FvSWXuVOrGx2bl_7rO4RfzRYfNIEg4YA_j1pM4UZVdQzTsy_L7gj1yB1B_JHHmZZDc4SbCol36-e7g";

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
