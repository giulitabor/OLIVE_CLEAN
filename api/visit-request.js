export default async function handler(req, res){

    if(req.method !== "POST"){
        return res.status(405).json({
            message:"Method not allowed"
        });
    }


    const {
        first_name,
        last_name,
        email,
        phone,
        request
    } = req.body;


    const message = `
New Olivium Visit Request

Name:
${first_name} ${last_name}

Email:
${email}

Phone:
${phone}

Request:
${request}
`;


    await fetch("https://api.emailjs.com/api/v1.0/email/send", {

        method:"POST",

        headers:{
            "Content-Type":"application/json"
        },

        body:JSON.stringify({

            service_id:process.env.EMAILJS_SERVICE,
            template_id:process.env.EMAILJS_TEMPLATE,
            user_id:process.env.EMAILJS_PUBLIC_KEY,

            template_params:{
                message:message
            }

        })

    });


    return res.status(200).json({
        success:true
    });

}
